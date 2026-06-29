import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { WidgetCard } from '@/components/features/widget-card'
import { useCompleteInstance, useTodaysChores } from '@/api/chores'
import { cn } from '@/lib/utils'
import { isOverdueOrToday, relativeDay } from '@/lib/format'

/** Open chore instances due today or overdue (spec §8.12). */
export function TodaysChoresWidget() {
  const { data: instances, isPending } = useTodaysChores()
  const complete = useCompleteInstance()

  return (
    <WidgetCard
      title="Today's chores"
      action={instances && instances.length > 0 ? <span>{instances.length}</span> : undefined}
      footer={
        <Link to="/chores" className="inline-block text-xs text-accent hover:underline">
          Open chores
        </Link>
      }
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !instances || instances.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing due today. All caught up.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {instances.slice(0, 6).map((instance) => {
            const urgent = isOverdueOrToday(instance.dueDate)
            return (
              <li key={instance.id} className="flex items-center gap-3 py-1.5 text-sm">
                <button
                  type="button"
                  onClick={() => void complete.mutateAsync({ id: instance.id })}
                  disabled={complete.isPending}
                  aria-label={`Mark ${instance.chore.title} done`}
                  className="flex size-6 shrink-0 items-center justify-center rounded-pill border border-line bg-surface text-transparent transition-colors hover:border-accent hover:text-accent"
                >
                  <Check className="size-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-ink">{instance.chore.title}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium',
                    urgent
                      ? 'bg-warning text-[var(--destructive-foreground)]'
                      : 'bg-accent-soft text-accent',
                  )}
                >
                  {relativeDay(instance.dueDate)}
                </span>
                <span
                  aria-hidden
                  title={`Assigned to ${instance.assignedTo.firstName}`}
                  className="inline-block size-2.5 shrink-0 rounded-pill"
                  style={{ backgroundColor: instance.assignedTo.colour }}
                />
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
