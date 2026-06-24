import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb, Play, Power, ToyBrick, type LucideIcon } from 'lucide-react'
import type { HaEntityState, PublicUser } from '@hame/shared'
import { HA_ACTIVATE_DOMAINS, HA_TOGGLE_DOMAINS } from '@hame/shared'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/api/client'
import { useCurrentUser } from '@/api/auth'
import {
  useHaEntities,
  useSmartHomeControls,
  useUpdateSmartHomeControls,
} from '@/api/home-assistant'
import { cn } from '@/lib/utils'

const CONTROLLABLE = [...HA_TOGGLE_DOMAINS, ...HA_ACTIVATE_DOMAINS] as readonly string[]

/** Display groups, in render order, with a label + icon per domain. */
const GROUPS: { domain: string; label: string; Icon: LucideIcon }[] = [
  { domain: 'light', label: 'Lights', Icon: Lightbulb },
  { domain: 'switch', label: 'Switches', Icon: Power },
  { domain: 'fan', label: 'Fans', Icon: Power },
  { domain: 'scene', label: 'Scenes', Icon: Play },
  { domain: 'script', label: 'Scripts', Icon: ToyBrick },
]

function label(entity: HaEntityState): string {
  return entity.friendlyName ?? entity.entityId
}

/**
 * Smart-home control selection (spec §8.12, §10 Phase 6.3). Browse every
 * controllable Home Assistant entity, grouped by type, and pick which appear on
 * the dashboard's smart-home widget — so the widget shows a chosen few, not the
 * whole house. The selection is household-wide (the wall tablet is shared).
 */
export function SmartHomePage() {
  const { data: me } = useCurrentUser()
  const { data: entities, isPending: entitiesPending } = useHaEntities()
  const { data: settings, isPending: settingsPending } = useSmartHomeControls()
  const save = useUpdateSmartHomeControls()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Seed local selection from the saved list once it loads.
  useEffect(() => {
    if (settings) setSelected(new Set(settings.entityIds))
  }, [settings])

  // Controllable entities, grouped by domain and sorted by name within a group.
  const grouped = useMemo(() => {
    const list = (entities ?? [])
      .filter((e) => CONTROLLABLE.includes(e.domain))
      .sort((a, b) => label(a).localeCompare(label(b)))
    return GROUPS.map((g) => ({ ...g, items: list.filter((e) => e.domain === g.domain) })).filter(
      (g) => g.items.length > 0,
    )
  }, [entities])

  const orderedIds = useMemo(
    () => grouped.flatMap((g) => g.items.map((e) => e.entityId)),
    [grouped],
  )
  const savedSet = useMemo(() => new Set(settings?.entityIds ?? []), [settings])
  const dirty = selected.size !== savedSet.size || [...selected].some((id) => !savedSet.has(id))

  function toggle(entityId: string) {
    setSaved(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(entityId)) next.delete(entityId)
      else next.add(entityId)
      return next
    })
  }

  async function handleSave() {
    setError(null)
    setSaved(false)
    // Persist in display order, so the widget renders predictably.
    const entityIds = orderedIds.filter((id) => selected.has(id))
    try {
      await save.mutateAsync({ entityIds })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your controls.')
    }
  }

  const loading = entitiesPending || settingsPending
  const hasControllable = grouped.length > 0

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Smart home</h1>
        <AppNav user={(me as PublicUser | null) ?? null} />
      </header>

      <p className="max-w-2xl text-sm text-muted-foreground">
        Choose which Home Assistant devices appear on your dashboard’s smart-home widget. Pick a
        handful you actually use — lights, switches, scenes — rather than the whole house.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading devices…</p>
      ) : !hasControllable ? (
        <div className="rounded-card border border-line bg-surface p-6 text-sm text-muted-foreground">
          No controllable Home Assistant devices found. Connect Home Assistant under{' '}
          <Link to="/settings" className="text-accent hover:underline">
            Settings
          </Link>{' '}
          (admin), then come back here.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-6">
            {grouped.map((group) => (
              <section key={group.domain} className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <group.Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
                  {group.label}
                  <span className="font-medium normal-case tracking-normal">
                    ({group.items.filter((e) => selected.has(e.entityId)).length}/
                    {group.items.length})
                  </span>
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((entity) => {
                    const on = selected.has(entity.entityId)
                    return (
                      <li key={entity.entityId}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-control border bg-surface p-3 transition-colors',
                            on ? 'border-accent' : 'border-line hover:border-accent/50',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(entity.entityId)}
                            className="mt-0.5 size-4 shrink-0 accent-accent"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">
                              {label(entity)}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {entity.entityId}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="sticky bottom-4 flex items-center gap-3 rounded-card border border-line bg-surface/95 p-4 backdrop-blur">
            <Button onClick={() => void handleSave()} disabled={!dirty || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save controls'}
            </Button>
            <span className="text-sm text-muted-foreground">
              {selected.size} selected
              {dirty ? ' · unsaved changes' : saved ? ' · saved' : ''}
            </span>
            {error && <span className="text-sm text-warning">{error}</span>}
            <Link to="/" className="ml-auto text-sm text-accent hover:underline">
              Back to dashboard
            </Link>
          </div>
        </>
      )}
    </main>
  )
}
