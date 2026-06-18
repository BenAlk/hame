import { Check, X } from 'lucide-react'
import type { ShoppingListItem } from '@hame/shared'
import { cn } from '@/lib/utils'
import { quantityLabel } from '@/lib/format'

interface CheckRowProps {
  row: ShoppingListItem
  onToggle: () => void
  onRemove: () => void
  disabled?: boolean
}

/**
 * Shopping check row (design §6): leading rounded-square check control, label,
 * trailing quantity and the member-colour dot. Ticked rows fill the box with a
 * white tick and strike through the label.
 */
export function CheckRow({ row, onToggle, onRemove, disabled }: CheckRowProps) {
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
        className="shrink-0 rounded-control p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
