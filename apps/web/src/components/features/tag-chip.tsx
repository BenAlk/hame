import type { Tag } from '@hame/shared'
import { cn } from '@/lib/utils'

/**
 * A tag pill (design §6). When the tag has a colour it tints to a soft version
 * of that hue; otherwise it falls back to the accent-soft chip.
 */
export function TagChip({ tag, className }: { tag: Tag; className?: string }) {
  const style = tag.colour ? { backgroundColor: `${tag.colour}22`, color: tag.colour } : undefined
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium',
        !tag.colour && 'bg-accent-soft text-accent',
        className,
      )}
    >
      {tag.name}
    </span>
  )
}
