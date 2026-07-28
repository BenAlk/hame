import { describe, it, expect } from 'vitest'
import type { Section, Shop, ShoppingListItem } from '@hame/shared'
import { ANY_SHOP, UNSECTIONED, groupItems } from './shopping-groups'

const lidl: Shop = { id: 's1', name: 'Lidl', colour: null }
const aldi: Shop = { id: 's2', name: 'Aldi', colour: null }
// Positions are the walking order, deliberately not alphabetical.
const produce: Section = { id: 'sec1', name: 'Produce', colour: null, position: 1 }
const dairySection: Section = { id: 'sec2', name: 'Dairy', colour: null, position: 5 }
const frozen: Section = { id: 'sec3', name: 'Frozen', colour: null, position: 6 }

function row(
  name: string,
  over: { shop?: Shop | null; section?: Section | null; isBought?: boolean } = {},
): ShoppingListItem {
  return {
    id: `row-${name}`,
    quantity: null,
    unit: null,
    notes: null,
    isBought: over.isBought ?? false,
    sources: ['MANUAL'],
    addedBy: { id: 'u1', firstName: 'Ben', colour: '#000000' },
    item: {
      id: `i-${name}`,
      name,
      shop: over.shop ?? null,
      section: over.section ?? null,
      tags: [],
    },
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

  it('groups by section, with unsectioned items last', () => {
    const groups = groupItems(
      [row('Milk', { section: dairySection }), row('Bread'), row('Carrots', { section: produce })],
      'section',
    )
    expect(groups.map(([name]) => name)).toEqual(['Produce', 'Dairy', UNSECTIONED])
  })

  /**
   * The whole point of Section being a field with a position: the list reads in
   * the order you walk the shop, not alphabetically (which would put Dairy first
   * and Produce last).
   */
  it('orders sections by walking position, not by name', () => {
    const groups = groupItems(
      [row('Peas', { section: frozen }), row('Butter', { section: dairySection })],
      'section',
    )
    expect(groups.map(([name]) => name)).toEqual(['Dairy', 'Frozen'])
  })

  /** The shop field must not disturb the section view. */
  it('ignores the shop entirely when grouping by section', () => {
    const groups = groupItems([row('Coffee', { shop: lidl, section: dairySection })], 'section')
    expect(groups).toHaveLength(1)
    expect(groups[0][0]).toBe('Dairy')
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
