import { describe, it, expect } from 'vitest'
import type { Shop, ShoppingListItem, Tag } from '@hame/shared'
import { ANY_SHOP, UNTAGGED, groupItems } from './shopping-groups'

const lidl: Shop = { id: 's1', name: 'Lidl', colour: null }
const aldi: Shop = { id: 's2', name: 'Aldi', colour: null }
const dairy: Tag = { id: 't1', name: 'dairy', colour: null }

function row(
  name: string,
  over: { shop?: Shop | null; tags?: Tag[]; isBought?: boolean } = {},
): ShoppingListItem {
  return {
    id: `row-${name}`,
    quantity: null,
    unit: null,
    notes: null,
    isBought: over.isBought ?? false,
    sources: ['MANUAL'],
    addedBy: { id: 'u1', firstName: 'Ben', colour: '#000000' },
    item: { id: `i-${name}`, name, shop: over.shop ?? null, tags: over.tags ?? [] },
  } as unknown as ShoppingListItem
}

describe('groupItems', () => {
  it('groups by shop, with unassigned items last', () => {
    const groups = groupItems(
      [row('Bread'), row('Coffee', { shop: lidl }), row('Tablets', { shop: aldi })],
      'shop',
    )
    expect(groups.map(([name]) => name)).toEqual(['Aldi', 'Lidl', ANY_SHOP])
  })

  it('groups by first tag when grouping by category', () => {
    const groups = groupItems([row('Milk', { tags: [dairy] }), row('Bread')], 'category')
    expect(groups.map(([name]) => name)).toEqual(['dairy', UNTAGGED])
  })

  /** The shop field must not disturb the existing category view. */
  it('ignores the shop entirely when grouping by category', () => {
    const groups = groupItems([row('Coffee', { shop: lidl, tags: [dairy] })], 'category')
    expect(groups).toHaveLength(1)
    expect(groups[0][0]).toBe('dairy')
  })

  it('sinks bought items to the bottom of their group', () => {
    const groups = groupItems(
      [
        row('Coffee', { shop: lidl, isBought: true }),
        row('Crisps', { shop: lidl }),
        row('Cheese', { shop: lidl, isBought: true }),
      ],
      'shop',
    )
    expect(groups[0][1].map((r) => r.item.name)).toEqual(['Crisps', 'Coffee', 'Cheese'])
  })

  it('returns no groups for an empty list', () => {
    expect(groupItems([], 'shop')).toEqual([])
  })
})
