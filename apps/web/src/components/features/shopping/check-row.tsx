import { Check, X } from 'lucide-react'
import type { ShoppingItemSource, ShoppingListItem } from '@hame/shared'
import { cn } from '@/lib/utils'
import { quantityLabel } from '@/lib/format'
import { ShopChip } from '@/components/features/shop-chip'

interface CheckRowProps {
  row: ShoppingListItem
  onToggle: () => void
  onRemove: () => void
  disabled?: boolean
  /** Show the item's shop chip — redundant when the list is already grouped by shop. */
  showShop?: boolean
}

const SOURCE_LABELS: Record<ShoppingItemSource, string> = {
  MANUAL: 'added by hand',
  MEAL_PLAN: 'meal plan',
  CONSUMABLES: 'consumables',
  ROLLOVER: 'rolled over',
}

/**
 * A ×N badge on lines summed from more than one channel (spec §8.3): N is the
 * count of distinct sources (capped at 4), so a merged quantity is easy to spot
 * and sanity-check. Its tooltip names the sources.
 */
function MergeBadge({ sources }: { sources: ShoppingItemSource[] }) {
  if (sources.length < 2) return null
  const n = Math.min(sources.length, 4)
  const title = `Summed from: ${sources.map((s) => SOURCE_LABELS[s]).join(', ')}`
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-pill bg-accent-soft text-[10px] font-semibold text-accent"
    >
      ×{n}
    </span>
  )
}

/**
 * Shopping check row (design §6): leading rounded-square check control, label,
 * trailing quantity and the member-colour dot. Ticked rows fill the box with a
 * white tick and strike through the label.
 */
export function CheckRow({ row, onToggle, onRemove, disabled, showShop }: CheckRowProps) {
  const qty = quantityLabel(row.quantity, row.unit)
  return (
    <div className="group flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        role="checkbox"
        aria-checked={row.isBought}
        aria-label={`Mark ${row.item.name} as ${row.isBought ? 'not bought' : 'bought'}`}
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors',
          row.isBought ? 'border-accent bg-accent text-white' : 'border-line bg-surface',
        )}
      >
        {row.isBought && <Check className="size-4" />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm',
            row.isBought ? 'text-muted-foreground line-through' : 'text-ink',
          )}
        >
          {row.item.name}
        </p>
        {row.notes && <p className="truncate text-xs text-muted-foreground">{row.notes}</p>}
      </div>

      {showShop && row.item.shop && <ShopChip shop={row.item.shop} />}

      <MergeBadge sources={row.sources} />

      {qty && <span className="shrink-0 text-xs text-muted-foreground">{qty}</span>}

      <span
        aria-hidden
        title={`Added by ${row.addedBy.firstName}`}
        className="inline-block size-2.5 shrink-0 rounded-pill"
        style={{ backgroundColor: row.addedBy.colour }}
      />

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${row.item.name}`}
        className="shrink-0 rounded-control p-1 text-muted-foreground opacity-100 transition-opacity hover:bg-muted hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
