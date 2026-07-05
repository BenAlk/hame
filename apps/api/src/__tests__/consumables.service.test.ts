import { describe, it, expect, vi, beforeEach } from 'vitest'

const itemFindMany = vi.fn()
const shoppingItemFindMany = vi.fn()
const settingsUpsert = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    item: { findMany: itemFindMany },
    shoppingListItem: { findMany: shoppingItemFindMany },
    householdSettings: { upsert: settingsUpsert },
  },
}))

const { listConsumables } = await import('../services/consumables.service.js')

/** A minimal consumable item row (with expanded tags) as Prisma would return it. */
function itemRow(over: Record<string, unknown>) {
  return {
    id: 'it1',
    name: 'Toilet roll',
    defaultQuantity: null,
    defaultUnit: 'pack',
    baseUnit: 'unit',
    typicalUnitGrams: null,
    minimumQuantity: null,
    isStaple: false,
    isConsumable: true,
    reorderIntervalDays: null,
    tags: [],
    createdById: 'u1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  }
}

/** Bought lines `gaps` whole-days apart (oldest first), all for item `it1`. */
function boughtRows(gaps: number[]) {
  const days = [0]
  for (const g of gaps) days.push(days[days.length - 1] + g)
  return days.map((d) => ({
    itemId: 'it1',
    boughtAt: new Date(Date.UTC(2026, 0, 1, 12) + d * 86_400_000),
  }))
}

function setAuto(enabled: boolean) {
  settingsUpsert.mockResolvedValue({ autoConsumableCadence: enabled })
}

beforeEach(() => {
  for (const fn of [itemFindMany, shoppingItemFindMany, settingsUpsert]) fn.mockReset()
})

describe('listConsumables cadence', () => {
  it('derives the newest last-bought date', async () => {
    setAuto(false)
    itemFindMany.mockResolvedValue([itemRow({})])
    shoppingItemFindMany.mockResolvedValue(boughtRows([21, 21]))
    const [c] = await listConsumables()
    // Three purchases anchored at 2026-01-01, 01-22, 02-12 → newest is 02-12.
    expect(c.lastBoughtAt).toEqual(new Date(Date.UTC(2026, 1, 12, 12)))
  })

  it('surfaces no suggestion when the Labs toggle is off', async () => {
    setAuto(false)
    itemFindMany.mockResolvedValue([itemRow({})])
    shoppingItemFindMany.mockResolvedValue(boughtRows([21, 21, 21])) // 4 regular buys
    const [c] = await listConsumables()
    expect(c).toMatchObject({
      suggestedIntervalDays: null,
      suggestionConfident: false,
      effectiveIntervalDays: null,
      cadenceState: 'none',
    })
  })

  it('auto-applies a confident estimate when on and no manual cadence', async () => {
    setAuto(true)
    itemFindMany.mockResolvedValue([itemRow({})])
    shoppingItemFindMany.mockResolvedValue(boughtRows([21, 21, 21]))
    const [c] = await listConsumables()
    expect(c).toMatchObject({
      suggestedIntervalDays: 21,
      suggestionConfident: true,
      effectiveIntervalDays: 21,
      cadenceState: 'auto',
    })
  })

  it('only suggests (does not apply) at three purchases', async () => {
    setAuto(true)
    itemFindMany.mockResolvedValue([itemRow({})])
    shoppingItemFindMany.mockResolvedValue(boughtRows([21, 21])) // 3 buys
    const [c] = await listConsumables()
    expect(c).toMatchObject({
      suggestedIntervalDays: 21,
      suggestionConfident: false,
      effectiveIntervalDays: null,
      cadenceState: 'suggested',
    })
  })

  it('keeps a manual cadence in force and flags divergence', async () => {
    setAuto(true)
    itemFindMany.mockResolvedValue([itemRow({ reorderIntervalDays: 7 })])
    shoppingItemFindMany.mockResolvedValue(boughtRows([21, 21, 21])) // history says ~21
    const [c] = await listConsumables()
    expect(c).toMatchObject({
      effectiveIntervalDays: 7, // manual wins
      suggestedIntervalDays: 21,
      cadenceState: 'diverged',
    })
  })

  it('short-circuits with no consumables', async () => {
    itemFindMany.mockResolvedValue([])
    expect(await listConsumables()).toEqual([])
    expect(settingsUpsert).not.toHaveBeenCalled()
    expect(shoppingItemFindMany).not.toHaveBeenCalled()
  })
})
