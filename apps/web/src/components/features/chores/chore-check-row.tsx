import { Check, Pencil, Trash2 } from 'lucide-react'
import type { Chore } from '@hame/shared'
import { cn } from '@/lib/utils'
import { isOverdueOrToday, relativeDay } from '@/lib/format'
import { recurrenceSummary } from '@/lib/chores'

interface ChoreCheckRowProps {
  chore: Chore
  onComplete: (instanceId: string) => void
  onEdit: () => void
  onDelete: () => void
  disabled?: boolean
}

/**
 * Chore row (design §6): a leading **circle** check (vs shopping's square),
 * title + schedule meta, a due-date chip, the assignee colour dot, and
 * edit/remove affordances. Completing ticks the open instance.
 */
export function ChoreCheckRow({
  chore,
  onComplete,
  onEdit,
  onDelete,
  disabled,
}: ChoreCheckRowProps) {
  const open = chore.openInstance
  const urgent = open ? isOverdueOrToday(open.dueDate) : false

  return (
    <div className="group flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={() => open && onComplete(open.id)}
        disabled={disabled || !open}
        role="checkbox"
        aria-checked={false}
        aria-label={`Mark ${chore.title} done`}
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-pill border border-line bg-surface text-transparent transition-colors',
          open ? 'hover:border-accent hover:text-accent' : 'opacity-40',
        )}
      >
        <Check className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{chore.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {recurrenceSummary(chore)}
          {chore.pet ? ` · ${chore.pet.name}` : ''}
        </p>
      </div>

      {open && (
        <span
          className={cn(
            'shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium',
            urgent
              ? 'bg-warning text-[var(--destructive-foreground)]'
              : 'bg-accent-soft text-accent',
          )}
        >
          {relativeDay(open.dueDate)}
        </span>
      )}

      {open && (
        <span
          aria-hidden
          title={`Assigned to ${open.assignedTo.firstName}`}
          className="inline-block size-2.5 shrink-0 rounded-pill"
          style={{ backgroundColor: open.assignedTo.colour }}
        />
      )}

      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        aria-label={`Edit ${chore.title}`}
        className="shrink-0 rounded-control p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={`Delete ${chore.title}`}
        className="shrink-0 rounded-control p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}
