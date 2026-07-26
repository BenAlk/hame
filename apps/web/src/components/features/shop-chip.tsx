import type { Shop } from '@hame/shared'
import { cn } from '@/lib/utils'

/**
 * A shop pill (design §6), mirroring the tag chip: tinted to the shop's colour
 * when it has one, otherwise the sage secondary — so a shop reads differently
 * from a category at a glance.
 */
export function ShopChip({ shop, className }: { shop: Shop; className?: string }) {
  const style = shop.colour
    ? { backgroundColor: `${shop.colour}22`, color: shop.colour }
    : undefined
  return (
    <span
      style={style}
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-[11px] font-medium',
        !shop.colour && 'bg-sage/15 text-sage',
        className,
      )}
    >
      {shop.name}
    </span>
  )
}
