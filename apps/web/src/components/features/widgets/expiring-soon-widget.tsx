import { Link } from 'react-router-dom'
import { WidgetCard } from '@/components/features/widget-card'
import { useExpiringSoon } from '@/api/pantry'
import { cn } from '@/lib/utils'
import { isOverdueOrToday, relativeDay } from '@/lib/format'

/** Pantry items expiring within the warning window (spec §8.12). */
export function ExpiringSoonWidget() {
  const { data: entries, isPending } = useExpiringSoon()

  return (
    <WidgetCard
      title="Expiring soon"
      action={entries && entries.length > 0 ? <span>{entries.length}</span> : undefined}
      footer={
        <Link to="/pantry" className="inline-block text-xs text-accent hover:underline">
          Open pantry
        </Link>
      }
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !entries || entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing expiring in the next few days.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.slice(0, 6).map((entry) => {
            const urgent = entry.expiryDate ? isOverdueOrToday(entry.expiryDate) : false
            return (
              <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink">{entry.item.name}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium',
                    urgent
                      ? 'bg-warning text-[var(--destructive-foreground)]'
                      : 'bg-accent-soft text-accent',
                  )}
                >
                  {entry.expiryDate ? relativeDay(entry.expiryDate) : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
