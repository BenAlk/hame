import { Link } from 'react-router-dom'
import { WidgetCard } from '@/components/features/widget-card'
import { useShoppingLists } from '@/api/shopping'
import { quantityLabel } from '@/lib/format'

/** Top items of the most recently active shopping list (design §7, spec §8.12). */
export function ActiveShoppingWidget() {
  const { data: lists, isPending } = useShoppingLists('ACTIVE')
  const list = lists?.[0]
  const outstanding = list?.items.filter((i) => !i.isBought) ?? []

  return (
    <WidgetCard
      title="Weekly shop"
      footer={
        <Link to="/shopping" className="inline-block text-xs text-accent hover:underline">
          Open shopping
        </Link>
      }
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !list ? (
        <p className="text-sm text-muted-foreground">
          No active list.{' '}
          <Link to="/shopping" className="text-accent hover:underline">
            Start one
          </Link>
          .
        </p>
      ) : outstanding.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everything ticked off.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {outstanding.slice(0, 6).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 truncate">
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-pill"
                  style={{ backgroundColor: row.addedBy.colour }}
                />
                <span className="truncate text-ink">{row.item.name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {quantityLabel(row.quantity, row.unit)}
              </span>
            </li>
          ))}
          {outstanding.length > 6 && (
            <li className="text-xs text-muted-foreground">+{outstanding.length - 6} more</li>
          )}
        </ul>
      )}
    </WidgetCard>
  )
}
