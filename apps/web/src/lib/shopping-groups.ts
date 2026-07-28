import type { ShoppingListItem } from '@hame/shared'

export const UNSECTIONED = 'Other'
export const ANY_SHOP = 'Any shop'

/** How the list is sectioned while shopping (spec §8.3). */
export type Grouping = 'section' | 'shop'

/**
 * Section a list's items, bought sinking to the bottom of each group and the
 * catch-all group ("Other" / "Any shop") sorting last. Grouping by shop is what
 * makes one list usable across two supermarkets, rather than keeping a parallel
 * list per shop.
 *
 * Sections sort by their **position** — the order you walk the shop (spec §8.3) —
 * which is the point of `Section` being a field rather than a tag. Shops have no
 * such order, so they stay alphabetical.
 */
export function groupItems(
  items: ShoppingListItem[],
  grouping: Grouping,
): [string, ShoppingListItem[]][] {
  const fallback = grouping === 'shop' ? ANY_SHOP : UNSECTIONED
  const groups = new Map<string, ShoppingListItem[]>()
  // Walking order, keyed by group name. The fallback has none and sorts last.
  const order = new Map<string, number>()

  for (const item of items) {
    const key =
      grouping === 'shop'
        ? (item.item.shop?.name ?? fallback)
        : (item.item.section?.name ?? fallback)
    groups.set(key, [...(groups.get(key) ?? []), item])
    if (grouping === 'section' && item.item.section) {
      order.set(key, item.item.section.position)
    }
  }

  for (const list of groups.values()) {
    list.sort((a, b) => Number(a.isBought) - Number(b.isBought))
  }

  return [...groups.entries()].sort(([a], [b]) => {
    if (a === fallback) return 1
    if (b === fallback) return -1
    const byOrder = (order.get(a) ?? 0) - (order.get(b) ?? 0)
    return byOrder !== 0 ? byOrder : a.localeCompare(b)
  })
}
