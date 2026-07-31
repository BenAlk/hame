import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, SlidersHorizontal, Thermometer } from 'lucide-react'
import type { HaClimateView, HaEntityState } from '@hame/shared'
import { clampSetpoint, haClimateView, HA_SETPOINT_DOMAINS } from '@hame/shared'
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
 */
function usePendingSetpoint(
  view: HaClimateView,
  send: (temperature: number) => void,
): { target: number | null; nudge: (direction: 1 | -1) => void } {
  const [pending, setPending] = useState<number | null>(null)
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendRef = useRef(send)
  sendRef.current = send

  // HA has caught up (or someone changed it there) — the local value has no more to say.
  useEffect(() => {
    if (pending !== null && view.target === pending) setPending(null)
  }, [pending, view.target])

  useEffect(
    () => () => {
      if (sendTimer.current) clearTimeout(sendTimer.current)
      if (giveUpTimer.current) clearTimeout(giveUpTimer.current)
    },
    [],
  )

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const from = pending ?? view.target ?? view.min
      const next = clampSetpoint(from + direction * view.step, view)
      setPending(next)

      if (sendTimer.current) clearTimeout(sendTimer.current)
      sendTimer.current = setTimeout(() => sendRef.current(next), SETPOINT_SEND_DELAY_MS)

      if (giveUpTimer.current) clearTimeout(giveUpTimer.current)
      giveUpTimer.current = setTimeout(() => setPending(null), SETPOINT_CONFIRM_TIMEOUT_MS)
    },
    [pending, view],
  )

  return { target: pending ?? view.target, nudge }
}

const STEP_BUTTON_CLASS =
  'inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-line text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink'

/**
 * One thermostat: the room's current temperature, its target on a stepper, and
 * on/off. Bounds and step come from the entity itself, so the stepper stops
 * exactly where the device does.
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

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3 text-sm">
        <Thermometer
          className={cn('size-4 shrink-0', view.isOn ? 'text-accent' : 'text-muted-foreground')}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-ink">{name}</span>
        {view.current !== null && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatTemp(view.current)}°
          </span>
        )}
        <ToggleSwitch
          on={view.isOn}
          busy={busy}
          ariaLabel={`Turn ${view.isOn ? 'off' : 'on'} ${name}`}
          onToggle={() => onCall('set_hvac_mode', { hvac_mode: view.isOn ? 'off' : 'heat' })}
        />
      </div>

      <div className="flex items-center gap-2 pl-7">
        <button
          type="button"
          aria-label={`Lower ${name} target temperature`}
          disabled={target !== null && target <= view.min}
          onClick={() => nudge(-1)}
          className={STEP_BUTTON_CLASS}
        >
          <Minus className="size-4" strokeWidth={2} aria-hidden />
        </button>
        <span
          aria-live="polite"
          className={cn(
            'min-w-[4.5rem] text-center font-serif text-2xl leading-none',
            view.isOn ? 'text-ink' : 'text-muted-foreground',
          )}
        >
          {target === null ? '—' : `${formatTemp(target)}°`}
        </span>
        <button
          type="button"
          aria-label={`Raise ${name} target temperature`}
          disabled={target !== null && target >= view.max}
          onClick={() => nudge(1)}
          className={STEP_BUTTON_CLASS}
        >
          <Plus className="size-4" strokeWidth={2} aria-hidden />
        </button>
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
 * Heating (spec §8.11, §10 Phase 20). A thermostat is a different kind of object
 * from a light — it carries a number, a range and a room temperature, not just an
 * on/off — so it gets its own widget rather than sharing the smart-home one,
 * where a two-line setpoint sat awkwardly among single-line toggles.
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
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-4">
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
            <p className="text-xs text-warning">Couldn’t reach the thermostat. Try again.</p>
          )}
        </div>
      )}
    </WidgetCard>
  )
}
