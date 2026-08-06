import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, SlidersHorizontal } from 'lucide-react'
import type { HaClimateStatus, HaClimateView, HaEntityState } from '@hame/shared'
import {
  clampSetpoint,
  climateOffCall,
  climateOnCall,
  climateStatus,
  haClimateView,
  isSchedulePreset,
  HA_SETPOINT_DOMAINS,
} from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { useDashboardOwner } from '@/components/features/dashboard/dashboard-owner'
import { useHaControl, useHaEntities, useSmartHomeControls } from '@/api/home-assistant'
import { ToggleSwitch } from './toggle-switch'
import { cn } from '@/lib/utils'

const SETPOINT_DOMAINS = HA_SETPOINT_DOMAINS as readonly string[]

/** How long a stepper tap waits for further taps before it reaches Home Assistant. */
const SETPOINT_SEND_DELAY_MS = 700

/** How long an unconfirmed setpoint keeps showing before it snaps back to HA's truth. */
const SETPOINT_CONFIRM_TIMEOUT_MS = 8000

/** How long a stepper is held before it starts repeating, and how fast it then does. */
const HOLD_DELAY_MS = 400
const HOLD_REPEAT_MS = 110

/** One decimal, but only when the step actually produces one (20 not 20.0). */
function formatTemp(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function label(entity: HaEntityState): string {
  return entity.friendlyName ?? entity.entityId
}

/**
 * A target temperature that answers the tap immediately, then reconciles.
 *
 * Entity truth arrives over SSE, so a setpoint driven straight from HA's state
 * would sit still for a beat after each tap — and nudging 19° to 21° is four taps,
 * which would crawl. So a tap moves a local value at once and only the *settled*
 * value is sent, which also spares HA (and the boiler) the intermediate steps.
 *
 * The local value is given up as soon as HA reports it, and abandoned outright
 * after a timeout — an unconfirmed setpoint snaps back to what the thermostat
 * actually says rather than leaving the wall tablet quietly lying about the house.
 *
 * `nudge` keeps a stable identity and reads the live value from a ref, so a held
 * stepper's repeat can keep calling the same function without going stale.
 */
function usePendingSetpoint(
  view: HaClimateView,
  send: (temperature: number) => void,
): { target: number | null; nudge: (direction: 1 | -1) => void } {
  const [pending, setPending] = useState<number | null>(null)
  const pendingRef = useRef<number | null>(null)
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendRef = useRef(send)
  const viewRef = useRef(view)
  sendRef.current = send
  viewRef.current = view

  const settle = useCallback((next: number | null) => {
    pendingRef.current = next
    setPending(next)
  }, [])

  // HA has caught up (or someone changed it there) — the local value has no more to say.
  useEffect(() => {
    if (pending !== null && view.target === pending) settle(null)
  }, [pending, view.target, settle])

  useEffect(
    () => () => {
      if (sendTimer.current) clearTimeout(sendTimer.current)
      if (giveUpTimer.current) clearTimeout(giveUpTimer.current)
    },
    [],
  )

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const live = viewRef.current
      const from = pendingRef.current ?? live.target ?? live.min
      const next = clampSetpoint(from + direction * live.step, live)
      settle(next)

      if (sendTimer.current) clearTimeout(sendTimer.current)
      sendTimer.current = setTimeout(() => sendRef.current(next), SETPOINT_SEND_DELAY_MS)

      if (giveUpTimer.current) clearTimeout(giveUpTimer.current)
      giveUpTimer.current = setTimeout(() => settle(null), SETPOINT_CONFIRM_TIMEOUT_MS)
    },
    [settle],
  )

  return { target: pending ?? view.target, nudge }
}

/**
 * A stepper that repeats while it's held down.
 *
 * Half a degree a tap is right for a small correction and wrong for a real change
 * — 19° to 21.5° is five taps at a wall tablet. Holding ramps instead, and because
 * every repeat resets the send debounce, a whole hold still reaches Home Assistant
 * as one setpoint.
 *
 * The pointer press is what acts, so the trailing click is swallowed; a keyboard
 * press produces a click with no pointer before it, which is why that path still
 * nudges. Releasing anywhere — including off the button — stops the repeat.
 */
function StepButton({
  direction,
  ariaLabel,
  disabled,
  onNudge,
}: {
  direction: 1 | -1
  ariaLabel: string
  disabled: boolean
  onNudge: (direction: 1 | -1) => void
}) {
  const fromPointer = useRef(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    if (repeatTimer.current) clearInterval(repeatTimer.current)
    holdTimer.current = null
    repeatTimer.current = null
  }, [])

  // A hold that runs into the device's own limit disables this button mid-repeat;
  // the timers would otherwise keep firing against a control nobody can see.
  useEffect(() => {
    if (disabled) stop()
  }, [disabled, stop])

  useEffect(() => stop, [stop])

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={() => {
        fromPointer.current = true
        onNudge(direction)
        holdTimer.current = setTimeout(() => {
          repeatTimer.current = setInterval(() => onNudge(direction), HOLD_REPEAT_MS)
        }, HOLD_DELAY_MS)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()} // a long press is a hold here, not a menu
      onClick={() => {
        if (fromPointer.current) {
          fromPointer.current = false
          return
        }
        onNudge(direction) // keyboard
      }}
      className="inline-flex size-11 shrink-0 select-none items-center justify-center rounded-pill border border-line text-ink transition-colors [touch-action:manipulation] hover:border-accent hover:text-accent disabled:opacity-35 disabled:hover:border-line disabled:hover:text-ink"
    >
      {direction === 1 ? (
        <Plus className="size-[18px]" strokeWidth={2} aria-hidden />
      ) : (
        <Minus className="size-[18px]" strokeWidth={2} aria-hidden />
      )}
    </button>
  )
}

/*
 * Dial geometry — a 240° sweep with the gap at the bottom, drawn in SVG's
 * y-down space. Held as constants so the arc, its fill and the room-temperature
 * marker are all derived from one description of the same curve.
 */
const ARC_CX = 125
const ARC_CY = 112
const ARC_R = 88
const ARC_START_DEG = 150
const ARC_SWEEP_DEG = 240
const ARC_LENGTH = ARC_R * ARC_SWEEP_DEG * (Math.PI / 180)

function arcPoint(degrees: number): [number, number] {
  const rad = (degrees * Math.PI) / 180
  return [ARC_CX + ARC_R * Math.cos(rad), ARC_CY + ARC_R * Math.sin(rad)]
}

const ARC_PATH = (() => {
  const [x0, y0] = arcPoint(ARC_START_DEG)
  const [x1, y1] = arcPoint(ARC_START_DEG + ARC_SWEEP_DEG)
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${ARC_R},${ARC_R} 0 1 1 ${x1.toFixed(1)},${y1.toFixed(1)}`
})()

/** Where a temperature sits on the dial, 0–1 across the device's own range. */
function fractionOf(value: number | null, view: HaClimateView): number {
  if (value === null || view.max <= view.min) return 0
  return Math.min(Math.max((value - view.min) / (view.max - view.min), 0), 1)
}

const STATUS_LABEL: Record<HaClimateStatus, string> = {
  off: 'Off',
  heating: 'Heating',
  idle: 'At temperature',
}

/**
 * The dial: the device's range as an arc, filled to the target, with the room's
 * actual temperature riding it as a marker. The gap between the two is the thing
 * a bare number can't say — whether it's about to get warmer in here.
 *
 * Everything inside scales as one unit (the type is SVG text, not HTML over the
 * top), so the dial fills whatever height its tile has instead of being clipped
 * by it.
 */
function Dial({
  view,
  target,
  status,
  name,
}: {
  view: HaClimateView
  target: number | null
  status: HaClimateStatus
  name: string
}) {
  const targetFraction = fractionOf(target, view)
  const [markerX, markerY] = arcPoint(
    ARC_START_DEG + ARC_SWEEP_DEG * fractionOf(view.current, view),
  )
  const off = status === 'off'

  return (
    <svg
      viewBox="0 0 250 186"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={`${name}: ${target === null ? 'no target set' : `set to ${formatTemp(target)}°`}${
        view.current === null ? '' : `, room ${formatTemp(view.current)}°`
      }`}
    >
      <path
        d={ARC_PATH}
        fill="none"
        strokeWidth={12}
        strokeLinecap="round"
        className="stroke-line"
      />
      {target !== null && (
        <path
          d={ARC_PATH}
          fill="none"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${(ARC_LENGTH * targetFraction).toFixed(1)} ${ARC_LENGTH + 1}`}
          className={cn(
            'transition-[stroke-dasharray] duration-200',
            off ? 'stroke-muted-foreground opacity-40' : 'stroke-accent',
          )}
        />
      )}
      {view.current !== null && (
        <circle
          cx={markerX.toFixed(1)}
          cy={markerY.toFixed(1)}
          r={4}
          className="fill-ink transition-[cx,cy] duration-200"
        />
      )}

      <text
        x={ARC_CX}
        y={116}
        textAnchor="middle"
        className={cn(
          'font-serif text-[52px] tabular-nums',
          off ? 'fill-muted-foreground' : 'fill-ink',
        )}
      >
        {target === null ? '—' : `${formatTemp(target)}°`}
      </text>
      {view.current !== null && (
        <text
          x={ARC_CX}
          y={143}
          textAnchor="middle"
          className="fill-muted-foreground text-[14px] tabular-nums"
        >
          Now {formatTemp(view.current)}°
        </text>
      )}

      <text x={40} y={176} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        {formatTemp(view.min)}°
      </text>
      <text x={210} y={176} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        {formatTemp(view.max)}°
      </text>
    </svg>
  )
}

/**
 * The presets the device offers, as a segmented pill — on a Tuya thermostat that
 * is "auto" (run the schedule) against "manual" (hold what I set).
 *
 * The labels are the device's own strings, only cased for display: this vocabulary
 * belongs to the integration, so inventing friendlier words here would be guessing
 * about someone else's thermostat. Shown only when there's an actual choice to
 * make, and the whole control is skipped for a device offering one preset or none.
 */
function PresetPill({
  view,
  busy,
  name,
  onCall,
}: {
  view: HaClimateView
  busy: boolean
  name: string
  onCall: (service: string, data?: Record<string, unknown>) => void
}) {
  if (view.presets.length < 2) return null

  return (
    <div
      role="group"
      aria-label={`${name} mode`}
      className="flex shrink-0 items-center gap-0.5 rounded-pill border border-line p-0.5"
    >
      {view.presets.map((preset) => {
        const active = view.preset === preset
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={active}
            disabled={busy}
            onClick={() => onCall('set_preset_mode', { preset_mode: preset })}
            className={cn(
              'rounded-pill px-2.5 py-0.5 text-[11px] font-semibold capitalize transition-colors disabled:opacity-50',
              active ? 'bg-accent text-white' : 'text-muted-foreground hover:text-ink',
            )}
          >
            {preset}
          </button>
        )
      })}
    </div>
  )
}

/**
 * One thermostat: its name and on/off above a dial, with the steppers and what
 * it's currently doing beneath. Bounds and step come from the entity itself, so
 * the stepper stops exactly where the device does.
 */
export function SetpointRow({
  entity,
  busy,
  onCall,
}: {
  entity: HaEntityState
  busy: boolean
  onCall: (service: string, data?: Record<string, unknown>) => void
}) {
  const view = useMemo(() => haClimateView(entity), [entity])
  const { target, nudge } = usePendingSetpoint(view, (temperature) =>
    onCall('set_temperature', { temperature }),
  )
  const name = label(entity)
  const status = climateStatus(view)

  // How *this* device switches, rather than what Hame would like to send.
  const powerCall = view.isOn ? climateOffCall(view) : climateOnCall(view)

  // In a schedule preset the thermostat owns the target, so a nudge is a hold
  // that expires — say so, rather than implying the wall tablet had the last word.
  const holdsUntilSchedule = view.isOn && isSchedulePreset(view.preset)

  return (
    <li className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="min-w-0 flex-1 truncate text-ink">{name}</span>
        <ToggleSwitch
          on={view.isOn}
          busy={busy || powerCall === null}
          ariaLabel={`Turn ${view.isOn ? 'off' : 'on'} ${name}`}
          onToggle={() => powerCall && onCall(powerCall.service, powerCall.data)}
        />
      </div>

      {(view.presets.length > 1 || holdsUntilSchedule) && (
        <div className="flex items-center justify-between gap-2">
          <PresetPill view={view} busy={busy} name={name} onCall={onCall} />
          {holdsUntilSchedule && (
            <span
              className="truncate text-[11px] text-muted-foreground"
              title="A change now holds until the thermostat’s next scheduled change."
            >
              holds until next change
            </span>
          )}
        </div>
      )}

      {/* The dial fills what's left; the floor keeps it legible on a short tile. */}
      <div className="flex min-h-[104px] flex-1 justify-center">
        <Dial view={view} target={target} status={status} name={name} />
      </div>
      <span className="sr-only" aria-live="polite">
        {target === null ? 'No target set' : `Target ${formatTemp(target)} degrees`}
      </span>

      <div className="flex items-center justify-between gap-2">
        <StepButton
          direction={-1}
          ariaLabel={`Lower ${name} target temperature`}
          disabled={target !== null && target <= view.min}
          onNudge={nudge}
        />
        <span
          aria-live="polite"
          className={cn(
            'truncate rounded-pill px-2.5 py-0.5 text-[11px] font-semibold',
            status === 'heating' && 'bg-accent-soft text-accent',
            status === 'idle' && 'bg-accent-soft text-sage',
            status === 'off' && 'text-muted-foreground',
          )}
        >
          {STATUS_LABEL[status]}
        </span>
        <StepButton
          direction={1}
          ariaLabel={`Raise ${name} target temperature`}
          disabled={target !== null && target >= view.max}
          onNudge={nudge}
        />
      </div>
    </li>
  )
}

/** Small link to the selection page, shown in the widget header. */
function ManageLink() {
  return (
    <Link
      to="/smart-home"
      aria-label="Choose controls"
      className="text-muted-foreground transition-colors hover:text-accent"
    >
      <SlidersHorizontal className="size-4" />
    </Link>
  )
}

/**
 * Heating (spec §8.11, §10 Phase 20, redrawn in Phase 22). A thermostat is a
 * different kind of object from a light — it carries a number, a range and a room
 * temperature, not just an on/off — so it gets its own widget rather than sharing
 * the smart-home one, and that whole card is now spent on a dial.
 *
 * It draws on the *same* curated per-owner selection as the smart-home widget
 * (chosen on /smart-home, §10 Phase 6.3/7.1b): one list of "devices I care
 * about", presented in two widgets by kind. Renders nothing unless HA exposes a
 * climate entity, so non-HA — and boiler-less — households never see it.
 */
export function HeatingWidget() {
  const { owner } = useDashboardOwner()
  const { data: entities } = useHaEntities()
  const { data: settings } = useSmartHomeControls(owner)
  const control = useHaControl()

  const thermostats = useMemo(() => {
    const byId = new Map((entities ?? []).map((e) => [e.entityId, e]))
    return (settings?.entityIds ?? [])
      .map((id) => byId.get(id))
      .filter((e): e is HaEntityState => e !== undefined && SETPOINT_DOMAINS.includes(e.domain))
  }, [entities, settings])

  const hasAnyThermostat = useMemo(
    () => (entities ?? []).some((e) => SETPOINT_DOMAINS.includes(e.domain)),
    [entities],
  )

  if (!hasAnyThermostat) return null // no HA / nothing to heat — stay hidden

  const pendingId = control.isPending ? control.variables?.entityId : undefined

  return (
    <WidgetCard title="Heating" action={<ManageLink />}>
      {thermostats.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No thermostats added yet.{' '}
          <Link to="/smart-home" className="text-accent hover:underline">
            Choose devices
          </Link>{' '}
          to add here.
        </p>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          {/* A second thermostat halves the space each dial gets, so they divide
              rather than crowd; past two, the card scrolls. */}
          <ul className="flex min-h-0 flex-1 flex-col gap-4 divide-y divide-line">
            {thermostats.map((entity) => (
              <SetpointRow
                key={entity.entityId}
                entity={entity}
                busy={pendingId === entity.entityId}
                onCall={(service, data) =>
                  void control.mutateAsync({
                    domain: entity.domain,
                    service,
                    entityId: entity.entityId,
                    data,
                  })
                }
              />
            ))}
          </ul>
          {control.isError && (
            <p className="shrink-0 text-xs text-warning">
              Couldn’t reach the thermostat. Try again.
            </p>
          )}
        </div>
      )}
    </WidgetCard>
  )
}
