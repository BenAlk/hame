import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb, Play, Power, SlidersHorizontal, ToyBrick } from 'lucide-react'
import type { HaEntityState } from '@hame/shared'
import { HA_ACTIVATE_DOMAINS, HA_ACTIVATE_SERVICE, HA_TOGGLE_DOMAINS } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { useHaControl, useHaEntities, useSmartHomeControls } from '@/api/home-assistant'
import { cn } from '@/lib/utils'

const TOGGLE_DOMAINS = HA_TOGGLE_DOMAINS as readonly string[]
const ACTIVATE_DOMAINS = HA_ACTIVATE_DOMAINS as readonly string[]
const CONTROLLABLE = [...TOGGLE_DOMAINS, ...ACTIVATE_DOMAINS]

/** Lucide glyph per controllable domain (line marks only — design §1, no emoji). */
const DOMAIN_ICON: Record<string, typeof Lightbulb> = {
  light: Lightbulb,
  switch: Power,
  fan: Power,
  scene: Play,
  script: ToyBrick,
}

function label(entity: HaEntityState): string {
  return entity.friendlyName ?? entity.entityId
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
 * Smart-home quick controls (spec §8.11, §8.12, §10 Phase 6.3). Shows the
 * household's *curated* controls (chosen on /smart-home), not every entity —
 * toggles for lights/switches/fans and "run" buttons for scenes/scripts, driving
 * Home Assistant via `call_service` (relayed over the API's socket). Entity truth
 * arrives over the SSE stream the dashboard owns, so a toggle reflects HA a beat
 * after the tap. Renders nothing unless HA exposes something controllable, so
 * non-HA households never see it.
 */
export function SmartHomeWidget() {
  const { data: entities } = useHaEntities()
  const { data: settings } = useSmartHomeControls()
  const control = useHaControl()

  // Everything HA can control (to decide whether to show the widget at all)…
  const hasControllable = useMemo(
    () => (entities ?? []).some((e) => CONTROLLABLE.includes(e.domain)),
    [entities],
  )

  // …then narrow to the curated selection, kept in the saved order.
  const { toggles, actions } = useMemo(() => {
    const byId = new Map((entities ?? []).map((e) => [e.entityId, e]))
    const chosen = (settings?.entityIds ?? [])
      .map((id) => byId.get(id))
      .filter((e): e is HaEntityState => e !== undefined && CONTROLLABLE.includes(e.domain))
    return {
      toggles: chosen.filter((e) => TOGGLE_DOMAINS.includes(e.domain)),
      actions: chosen.filter((e) => ACTIVATE_DOMAINS.includes(e.domain)),
    }
  }, [entities, settings])

  if (!hasControllable) return null // no HA / nothing controllable — stay hidden

  const pendingId = control.isPending ? control.variables?.entityId : undefined
  const empty = toggles.length === 0 && actions.length === 0

  return (
    <WidgetCard title="Smart home" action={<ManageLink />}>
      {empty ? (
        <p className="text-sm text-muted-foreground">
          No controls added yet.{' '}
          <Link to="/smart-home" className="text-accent hover:underline">
            Choose devices
          </Link>{' '}
          to add here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {toggles.length > 0 && (
            <ul className="flex flex-col gap-1">
              {toggles.map((entity) => {
                const Icon = DOMAIN_ICON[entity.domain] ?? Power
                const on = entity.state === 'on'
                const busy = pendingId === entity.entityId
                return (
                  <li key={entity.entityId} className="flex items-center gap-3 py-1 text-sm">
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        on ? 'text-accent' : 'text-muted-foreground',
                      )}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-ink">{label(entity)}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`Toggle ${label(entity)}`}
                      disabled={busy}
                      onClick={() =>
                        void control.mutateAsync({
                          domain: entity.domain,
                          service: 'toggle',
                          entityId: entity.entityId,
                        })
                      }
                      className={cn(
                        'relative h-6 w-[42px] shrink-0 rounded-pill transition-colors disabled:opacity-50',
                        on ? 'bg-accent' : 'bg-line',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 size-5 rounded-pill bg-surface shadow-sm transition-all',
                          on ? 'left-[19px]' : 'left-0.5',
                        )}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((entity) => {
                const Icon = DOMAIN_ICON[entity.domain] ?? Play
                const busy = pendingId === entity.entityId
                return (
                  <button
                    key={entity.entityId}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void control.mutateAsync({
                        domain: entity.domain,
                        service: HA_ACTIVATE_SERVICE[entity.domain] ?? 'turn_on',
                        entityId: entity.entityId,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
                    <span className="max-w-[10rem] truncate">{label(entity)}</span>
                  </button>
                )
              })}
            </div>
          )}

          {control.isError && (
            <p className="text-xs text-warning">Couldn’t reach that device. Try again.</p>
          )}
        </div>
      )}
    </WidgetCard>
  )
}
