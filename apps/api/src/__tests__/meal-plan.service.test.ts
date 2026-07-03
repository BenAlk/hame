import { describe, it, expect, vi, beforeEach } from 'vitest'

const entryFindMany = vi.fn()
const pantryFindMany = vi.fn()
const listFindFirst = vi.fn()
const listFindUnique = vi.fn()
const listCreate = vi.fn()
const itemFindMany = vi.fn()
const transaction = vi.fn()
const getShoppingList = vi.fn()
const mergeOrCreateLine = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    mealPlanEntry: { findMany: entryFindMany },
    pantryEntry: { findMany: pantryFindMany },
    shoppingList: { findFirst: listFindFirst, findUnique: listFindUnique, create: listCreate },
    item: { findMany: itemFindMany },
    $transaction: transaction,
  },
}))

vi.mock('../services/shopping.service.js', () => ({ getShoppingList, mergeOrCreateLine }))

const { previewShoppingList, generateShoppingList } =
  await import('../services/meal-plan.service.js')

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
  for (const fn of [
    entryFindMany,
    pantryFindMany,
    listFindFirst,
    listFindUnique,
    listCreate,
    itemFindMany,
    transaction,
    getShoppingList,
    mergeOrCreateLine,
  ])
    fn.mockReset()
  // Run the transaction callback against a tx that reuses the same mocks.
  transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      shoppingList: { findFirst: listFindFirst, findUnique: listFindUnique, create: listCreate },
      item: { findMany: itemFindMany },
    }),
  )
  itemFindMany.mockResolvedValue([])
  getShoppingList.mockResolvedValue({ id: 'target', items: [] })
})

const range = {
  startDate: new Date('2026-06-22'),
  endDate: new Date('2026-06-28'),
  consumableItemIds: [] as string[],
}

describe('previewShoppingList (shortfall computation)', () => {
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

    const preview = await previewShoppingList(range)

    expect(preview.lines).toEqual([
      { itemId: 'Flour', name: 'Flour', quantity: 300, unit: 'g' }, // 400 - 100
      { itemId: 'Milk', name: 'Milk', quantity: 2000, unit: 'ml' }, // none in pantry
    ])
    expect(preview.warnings).toEqual(['Spice'])
  })

  it('treats a unit-less quantity as a bare count even with no item base unit', async () => {
    entryFindMany.mockResolvedValue([
      { servings: null, recipe: { servings: 4, ingredients: [ing('Tomato', null, 1, null)] } },
    ])
    pantryFindMany.mockResolvedValue([])

    const preview = await previewShoppingList(range)
    expect(preview.lines).toEqual([{ itemId: 'Tomato', name: 'Tomato', quantity: 1, unit: 'unit' }])
    expect(preview.warnings).toEqual([])
  })

  it('subtracts unit-less pantry stock from a unit-less requirement', async () => {
    entryFindMany.mockResolvedValue([
      { servings: 8, recipe: { servings: 4, ingredients: [ing('Tomato', null, 1, null)] } }, // ×2 = 2
    ])
    pantryFindMany.mockResolvedValue([
      { itemId: 'Tomato', quantity: 1, unit: null, item: { baseUnit: null } },
    ])

    const preview = await previewShoppingList(range)
    expect(preview.lines).toEqual([{ itemId: 'Tomato', name: 'Tomato', quantity: 1, unit: 'unit' }]) // 2 - 1
  })

  it('returns no lines when the pantry already covers everything', async () => {
    entryFindMany.mockResolvedValue([
      { servings: null, recipe: { servings: 4, ingredients: [ing('Flour', 'g', 200, 'g')] } },
    ])
    pantryFindMany.mockResolvedValue([
      { itemId: 'Flour', quantity: 500, unit: 'g', item: { baseUnit: 'g' } },
    ])

    const preview = await previewShoppingList(range)
    expect(preview.lines).toEqual([])
  })

  it('returns nothing and skips the pantry lookup when nothing is planned', async () => {
    entryFindMany.mockResolvedValue([])
    const preview = await previewShoppingList(range)
    expect(pantryFindMany).not.toHaveBeenCalled()
    expect(preview).toEqual({ lines: [], warnings: [] })
  })

  it('sums the same item across multiple recipes', async () => {
    entryFindMany.mockResolvedValue([
      { servings: null, recipe: { servings: 4, ingredients: [ing('Flour', 'g', 200, 'g')] } },
      { servings: null, recipe: { servings: 4, ingredients: [ing('Flour', 'g', 150, 'g')] } },
    ])
    pantryFindMany.mockResolvedValue([])

    const preview = await previewShoppingList(range)
    expect(preview.lines).toEqual([{ itemId: 'Flour', name: 'Flour', quantity: 350, unit: 'g' }])
  })
})

describe('generateShoppingList (fold into a target list)', () => {
  it('folds the shortfall into the most-recent active list with MEAL_PLAN source', async () => {
    entryFindMany.mockResolvedValue([
      { servings: null, recipe: { servings: 4, ingredients: [ing('Flour', 'g', 200, 'g')] } },
    ])
    pantryFindMany.mockResolvedValue([])
    listFindFirst.mockResolvedValue({ id: 'active1', status: 'ACTIVE' })

    await generateShoppingList(range, 'u1')

    expect(listFindFirst).toHaveBeenCalledTimes(1) // resolve most-recent active
    expect(listCreate).not.toHaveBeenCalled()
    expect(mergeOrCreateLine).toHaveBeenCalledWith(expect.anything(), 'active1', {
      itemId: 'Flour',
      quantity: 200,
      unit: 'g',
      source: 'MEAL_PLAN',
      userId: 'u1',
    })
  })

  it('mints a new named list when listName is given', async () => {
    entryFindMany.mockResolvedValue([
      { servings: null, recipe: { servings: 4, ingredients: [ing('Flour', 'g', 200, 'g')] } },
    ])
    pantryFindMany.mockResolvedValue([])
    listCreate.mockResolvedValue({ id: 'fresh' })

    await generateShoppingList({ ...range, listName: 'Big shop' }, 'u1')

    expect(listFindFirst).not.toHaveBeenCalled() // named → skip active-list reuse
    expect(listCreate).toHaveBeenCalledWith({ data: { name: 'Big shop', createdById: 'u1' } })
  })

  it('folds ticked consumables in with the CONSUMABLES source', async () => {
    entryFindMany.mockResolvedValue([])
    listFindFirst.mockResolvedValue({ id: 'active1', status: 'ACTIVE' })
    itemFindMany.mockResolvedValue([
      { id: 'loo-roll', defaultQuantity: 1, defaultUnit: 'pack', isConsumable: true },
    ])

    await generateShoppingList({ ...range, consumableItemIds: ['loo-roll'] }, 'u1')

    expect(mergeOrCreateLine).toHaveBeenCalledWith(expect.anything(), 'active1', {
      itemId: 'loo-roll',
      quantity: 1,
      unit: 'pack',
      source: 'CONSUMABLES',
      userId: 'u1',
    })
  })

  it('does nothing when nothing is short and no consumables are ticked', async () => {
    entryFindMany.mockResolvedValue([])
    const result = await generateShoppingList(range, 'u1')
    expect(transaction).not.toHaveBeenCalled()
    expect(mergeOrCreateLine).not.toHaveBeenCalled()
    expect(result).toEqual({ list: null, warnings: [] })
  })
})
