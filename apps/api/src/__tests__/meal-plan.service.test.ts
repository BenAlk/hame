import { describe, it, expect, vi, beforeEach } from 'vitest'

const entryFindMany = vi.fn()
const pantryFindMany = vi.fn()
const listCreate = vi.fn()
const getShoppingList = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    mealPlanEntry: { findMany: entryFindMany },
    pantryEntry: { findMany: pantryFindMany },
    shoppingList: { create: listCreate },
  },
}))

vi.mock('../services/shopping.service.js', () => ({ getShoppingList }))

const { generateShoppingList } = await import('../services/meal-plan.service.js')

function ing(
  name: string,
  baseUnit: string | null,
  quantity: number | null,
  unit: string | null,
  isStaple = false,
) {
  return { quantity, unit, item: { id: name, name, baseUnit, isStaple } }
}

beforeEach(() => {
  for (const fn of [entryFindMany, pantryFindMany, listCreate, getShoppingList]) fn.mockReset()
  listCreate.mockResolvedValue({ id: 'new-list' })
  getShoppingList.mockResolvedValue({ id: 'new-list', items: [] })
})

const range = { startDate: new Date('2026-06-22'), endDate: new Date('2026-06-28') }

describe('generateShoppingList', () => {
  it('scales by servings, subtracts pantry, excludes staples and flags bad units', async () => {
    // One recipe (serves 4) planned at 8 servings → scale ×2.
    entryFindMany.mockResolvedValue([
      {
        servings: 8,
        recipe: {
          servings: 4,
          ingredients: [
            ing('Flour', 'g', 200, 'g'), // ×2 = 400g
            ing('Milk', 'ml', 1, 'l'), // ×2 = 2000ml
            ing('Eggs', 'unit', 2, 'unit'), // ×2 = 4 (pantry covers)
            ing('Salt', 'g', null, null, true), // staple → excluded
            ing('Spice', 'g', 1, 'tbsp'), // tbsp doesn't convert → warning
          ],
        },
      },
    ])
    pantryFindMany.mockResolvedValue([
      { itemId: 'Flour', quantity: 100, unit: 'g', item: { baseUnit: 'g' } },
      { itemId: 'Eggs', quantity: 6, unit: 'unit', item: { baseUnit: 'unit' } },
    ])

    const result = await generateShoppingList(range, 'u1')

    expect(listCreate).toHaveBeenCalledTimes(1)
    const items = listCreate.mock.calls[0][0].data.items.create
    expect(items).toEqual([
      { itemId: 'Flour', quantity: 300, unit: 'g', addedById: 'u1' }, // 400 - 100
      { itemId: 'Milk', quantity: 2000, unit: 'ml', addedById: 'u1' }, // none in pantry
    ])
    expect(result.warnings).toEqual(['Spice'])
    expect(result.list).toMatchObject({ id: 'new-list' })
  })

  it('treats a unit-less quantity as a bare count even with no item base unit', async () => {
    // "1 large tomato" — quantity but no unit, item never got a base unit.
    entryFindMany.mockResolvedValue([
      { servings: null, recipe: { servings: 4, ingredients: [ing('Tomato', null, 1, null)] } },
    ])
    pantryFindMany.mockResolvedValue([])

    const result = await generateShoppingList(range, 'u1')
    const items = listCreate.mock.calls[0][0].data.items.create
    expect(items).toEqual([{ itemId: 'Tomato', quantity: 1, unit: 'unit', addedById: 'u1' }])
    expect(result.warnings).toEqual([])
  })

  it('subtracts unit-less pantry stock from a unit-less requirement', async () => {
    entryFindMany.mockResolvedValue([
      { servings: 8, recipe: { servings: 4, ingredients: [ing('Tomato', null, 1, null)] } }, // ×2 = 2
    ])
    pantryFindMany.mockResolvedValue([
      { itemId: 'Tomato', quantity: 1, unit: null, item: { baseUnit: null } },
    ])

    await generateShoppingList(range, 'u1')
    const items = listCreate.mock.calls[0][0].data.items.create
    expect(items).toEqual([{ itemId: 'Tomato', quantity: 1, unit: 'unit', addedById: 'u1' }]) // 2 - 1
  })

  it('returns no list when the pantry already covers everything', async () => {
    entryFindMany.mockResolvedValue([
      { servings: null, recipe: { servings: 4, ingredients: [ing('Flour', 'g', 200, 'g')] } },
    ])
    pantryFindMany.mockResolvedValue([
      { itemId: 'Flour', quantity: 500, unit: 'g', item: { baseUnit: 'g' } },
    ])

    const result = await generateShoppingList(range, 'u1')
    expect(listCreate).not.toHaveBeenCalled()
    expect(result.list).toBeNull()
  })

  it('returns no list and no pantry lookup when nothing is planned', async () => {
    entryFindMany.mockResolvedValue([])
    const result = await generateShoppingList(range, 'u1')
    expect(pantryFindMany).not.toHaveBeenCalled()
    expect(listCreate).not.toHaveBeenCalled()
    expect(result).toEqual({ list: null, warnings: [] })
  })

  it('sums the same item across multiple recipes', async () => {
    entryFindMany.mockResolvedValue([
      { servings: null, recipe: { servings: 4, ingredients: [ing('Flour', 'g', 200, 'g')] } },
      { servings: null, recipe: { servings: 4, ingredients: [ing('Flour', 'g', 150, 'g')] } },
    ])
    pantryFindMany.mockResolvedValue([])

    await generateShoppingList(range, 'u1')
    const items = listCreate.mock.calls[0][0].data.items.create
    expect(items).toEqual([{ itemId: 'Flour', quantity: 350, unit: 'g', addedById: 'u1' }])
  })
})
