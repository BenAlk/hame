import { X } from 'lucide-react'
import type { Tag } from '@hame/shared'
import { cn } from '@/lib/utils'

/**
 * A tag pill (design §6). When the tag has a colour it tints to a soft version
 * of that hue; otherwise it falls back to the accent-soft chip.
 *
 * Passing `onRemove` makes it removable, for the editing surfaces — the pill
 * keeps its shape and gains a close affordance rather than becoming a different
 * control, so a tag reads the same wherever it appears.
 */
export function TagChip({
  tag,
  className,
  onRemove,
}: {
  tag: Tag
  className?: string
  onRemove?: () => void
}) {
  const style = tag.colour ? { backgroundColor: `${tag.colour}22`, color: tag.colour } : undefined
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium',
        !tag.colour && 'bg-accent-soft text-accent',
        className,
      )}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag ${tag.name}`}
          className="-mr-1 rounded-pill p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}
