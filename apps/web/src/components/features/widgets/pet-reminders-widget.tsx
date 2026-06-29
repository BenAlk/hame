import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import type { Chore } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { useChores } from '@/api/chores'
import { cn } from '@/lib/utils'
import { isOverdueOrToday, relativeDay } from '@/lib/format'

/** Upcoming pet-care chores — the next due occurrence per pet-linked chore. */
export function PetRemindersWidget() {
  const { data: chores, isPending } = useChores(true)

  const petChores = useMemo(
    () =>
      (chores ?? [])
        .filter((c): c is Chore & { pet: NonNullable<Chore['pet']> } =>
          Boolean(c.pet && c.openInstance),
        )
        .sort(
          (a, b) =>
            new Date(a.openInstance!.dueDate).getTime() -
            new Date(b.openInstance!.dueDate).getTime(),
        ),
    [chores],
  )

  return (
    <WidgetCard
      title="Pet reminders"
      action={petChores.length > 0 ? <span>{petChores.length}</span> : undefined}
      footer={
        <Link to="/pets" className="inline-block text-xs text-accent hover:underline">
          Open pets
        </Link>
      }
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : petChores.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pet care scheduled.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {petChores.slice(0, 6).map((chore) => {
            const due = chore.openInstance!
            const urgent = isOverdueOrToday(due.dueDate)
            return (
              <li key={chore.id} className="flex items-center justify-between gap-3 text-sm">
                <Link
                  to={`/pets/${chore.pet.id}`}
                  className="min-w-0 flex-1 truncate text-ink hover:underline"
                >
                  {chore.pet.name} · {chore.title}
                </Link>
                <span
                  className={cn(
                    'shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium',
                    urgent
                      ? 'bg-warning text-[var(--destructive-foreground)]'
                      : 'bg-accent-soft text-accent',
                  )}
                >
                  {relativeDay(due.dueDate)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
