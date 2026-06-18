import { describe, it, expect, vi, beforeEach } from 'vitest'

const itemFindMany = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { item: { findMany: itemFindMany } },
}))

const { listLowStock } = await import('../services/pantry.service.js')

// Minimal item shape the mapper/aggregator touches.
function item(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'i1',
    name: 'Milk',
    defaultQuantity: null,
    defaultUnit: null,
    baseUnit: 'ml',
    minimumQuantity: 2000,
    isStaple: false,
    tags: [],
    createdById: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
    pantryEntries: [],
    ...over,
  }
}

beforeEach(() => itemFindMany.mockReset())

describe('listLowStock', () => {
  it('sums entries in the base unit and flags items below minimum', async () => {
    itemFindMany.mockResolvedValue([
      item({
        pantryEntries: [
          { quantity: 1, unit: 'l', baseUnit: 'ml' }, // 1000 ml
          { quantity: 500, unit: 'ml' }, // 500 ml
        ],
      }),
    ])
    const result = await listLowStock()
    expect(result).toHaveLength(1)
    expect(result[0].totalQuantity).toBe(1500) // below 2000 minimum
    expect(result[0].hasUnconvertibleEntries).toBe(false)
  })

  it('excludes items at or above their minimum', async () => {
    itemFindMany.mockResolvedValue([
      item({ pantryEntries: [{ quantity: 3, unit: 'l' }] }), // 3000 ml ≥ 2000
    ])
    expect(await listLowStock()).toHaveLength(0)
  })

  it('excludes unconvertible entries from the sum and flags them', async () => {
    itemFindMany.mockResolvedValue([
      item({
        pantryEntries: [
          { quantity: 1, unit: 'l' }, // 1000 ml counts
          { quantity: 2, unit: 'bottle' }, // incompatible with ml → excluded
        ],
      }),
    ])
    const result = await listLowStock()
    expect(result[0].totalQuantity).toBe(1000)
    expect(result[0].hasUnconvertibleEntries).toBe(true)
  })

  it('treats an item with no stock as low', async () => {
    itemFindMany.mockResolvedValue([item({ pantryEntries: [] })])
    const result = await listLowStock()
    expect(result[0].totalQuantity).toBe(0)
  })
})
