import { Link } from 'react-router-dom'
import { Lightbulb, Play, Power, Sparkles, ToyBrick, type LucideIcon } from 'lucide-react'
import type { HaEntityState } from '@hame/shared'
import { useDashboardOwner } from '@/components/features/dashboard/dashboard-owner'
import {
  useAddSmartHomeControls,
  useDismissSmartHomeSuggestions,
  useSmartHomeSuggestions,
} from '@/api/home-assistant'

const DOMAIN_ICON: Record<string, LucideIcon> = {
  light: Lightbulb,
  switch: Power,
  fan: Power,
  scene: Play,
  script: ToyBrick,
}

function label(entity: HaEntityState): string {
  return entity.friendlyName ?? entity.entityId
}

/**
 * New-device prompt (spec §10 Phase 6.3, 7.1b). When Home Assistant gains a
 * controllable entity the current dashboard owner hasn't decided on, this
 * dismissible card offers to add it to that owner's smart-home widget. It's
 * seeded against a baseline at setup, so only devices added *later* appear here —
 * and Add/Dismiss both stop it asking again. Renders nothing when there's nothing
 * new.
 */
export function SmartHomeSuggestions({ enabled = true }: { enabled?: boolean }) {
  const { owner } = useDashboardOwner()
  const { data: suggestions } = useSmartHomeSuggestions(owner, enabled)
  const add = useAddSmartHomeControls(owner)
  const dismiss = useDismissSmartHomeSuggestions(owner)

  if (!suggestions || suggestions.length === 0) return null

  const allIds = suggestions.map((e) => e.entityId)
  const busy = add.isPending || dismiss.isPending

  return (
    <section className="rounded-card border border-accent/40 bg-accent-soft p-5 text-ink">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-accent" strokeWidth={1.75} aria-hidden />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
          {suggestions.length === 1 ? 'New smart-home device' : 'New smart-home devices'}
        </h2>
      </header>

      <ul className="flex flex-col gap-2">
        {suggestions.map((entity) => {
          const Icon = DOMAIN_ICON[entity.domain] ?? Power
          return (
            <li key={entity.entityId} className="flex items-center gap-3">
              <Icon
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm">{label(entity)}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void add.mutateAsync({ entityIds: [entity.entityId] })}
                className="rounded-pill bg-accent px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void dismiss.mutateAsync({ entityIds: [entity.entityId] })}
                className="rounded-pill px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-ink disabled:opacity-50"
              >
                Dismiss
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center gap-4 border-t border-accent/20 pt-3 text-xs">
        <Link to="/smart-home" className="text-accent hover:underline">
          Manage controls
        </Link>
        {suggestions.length > 1 && (
          <button
            type="button"
            disabled={dismiss.isPending}
            onClick={() => void dismiss.mutateAsync({ entityIds: allIds })}
            className="text-muted-foreground transition-colors hover:text-ink disabled:opacity-50"
          >
            Dismiss all
          </button>
        )}
      </div>
    </section>
  )
}
