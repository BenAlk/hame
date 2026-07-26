import type { ShoppingListItem } from '@hame/shared'

export const UNTAGGED = 'Other'
export const ANY_SHOP = 'Any shop'

/** How the list is sectioned while shopping (spec §8.3). */
export type Grouping = 'category' | 'shop'

/**
 * Section a list's items, bought sinking to the bottom of each group and the
 * catch-all group ("Other" / "Any shop") sorting last. Grouping by shop is what
 * makes one list usable across two supermarkets, rather than keeping a parallel
 * list per shop.
 */
export function groupItems(
  items: ShoppingListItem[],
  grouping: Grouping,
): [string, ShoppingListItem[]][] {
  const fallback = grouping === 'shop' ? ANY_SHOP : UNTAGGED
  const groups = new Map<string, ShoppingListItem[]>()
  for (const item of items) {
    const key =
      grouping === 'shop'
        ? (item.item.shop?.name ?? fallback)
        : (item.item.tags[0]?.name ?? fallback)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  for (const list of groups.values()) {
    list.sort((a, b) => Number(a.isBought) - Number(b.isBought))
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === fallback ? 1 : b === fallback ? -1 : a.localeCompare(b),
  )
}
