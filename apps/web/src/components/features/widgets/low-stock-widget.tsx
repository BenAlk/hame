import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { WidgetCard } from '@/components/features/widget-card'
import { useLowStock } from '@/api/pantry'

/** Items whose total stock has dropped below their minimum (spec §8.4, §8.12). */
export function LowStockWidget() {
  const { data: items, isPending } = useLowStock()

  return (
    <WidgetCard
      title="Low stock"
      action={items && items.length > 0 ? <span>{items.length}</span> : undefined}
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !items || items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Stock levels look healthy.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items
            .slice(0, 6)
            .map(({ item, totalQuantity, minimumQuantity, hasUnconvertibleEntries }) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink">{item.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {totalQuantity}
                  {item.baseUnit ?? ''} / {minimumQuantity}
                  {item.baseUnit ?? ''}
                  {hasUnconvertibleEntries && (
                    <AlertTriangle
                      className="ml-1 inline size-3 text-warning"
                      aria-label="Some stock is in an incompatible unit and was not counted"
                    />
                  )}
                </span>
              </li>
            ))}
        </ul>
      )}
      <Link to="/pantry" className="mt-3 inline-block text-xs text-accent hover:underline">
        Open pantry
      </Link>
    </WidgetCard>
  )
}
