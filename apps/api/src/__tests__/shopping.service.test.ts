import { describe, it, expect, vi, beforeEach } from 'vitest'

const listFindUnique = vi.fn()
const listDelete = vi.fn()
const locationCount = vi.fn()
const transaction = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    shoppingList: { findUnique: listFindUnique, delete: listDelete },
    storageLocation: { count: locationCount },
    $transaction: transaction,
  },
}))

const { archiveShoppingList, deleteShoppingList, mergeOrCreateLine } =
  await import('../services/shopping.service.js')

/** A tx stub whose findMany returns the given existing unbought lines. */
function txWith(candidates: unknown[]) {
  return {
    shoppingListItem: {
      findMany: vi.fn().mockResolvedValue(candidates),
      update: vi.fn().mockResolvedValue({ id: 'updated' }),
      create: vi.fn().mockResolvedValue({ id: 'created' }),
    },
  }
}

function line(over: Record<string, unknown>) {
  return {
    id: 'x',
    quantity: null,
    unit: null,
    sources: ['MANUAL'],
    item: { baseUnit: null },
    ...over,
  }
}

const activeList = {
  id: 'l1',
  name: 'Weekly Shop',
  status: 'ACTIVE' as const,
  items: [
    { id: 'si1', itemId: 'it1', quantity: 2, unit: 'l', notes: null, addedById: 'u1' },
    { id: 'si2', itemId: 'it2', quantity: null, unit: null, notes: null, addedById: 'u1' },
  ],
}

beforeEach(() => {
  for (const fn of [listFindUnique, listDelete, locationCount, transaction]) fn.mockReset()
})

describe('deleteShoppingList', () => {
  it('deletes an active (non-empty) list — no archived-status guard', async () => {
    listFindUnique.mockResolvedValue(activeList) // ACTIVE, with items
    listDelete.mockResolvedValue(activeList)
    await deleteShoppingList('l1')
    expect(listDelete).toHaveBeenCalledWith({ where: { id: 'l1' } })
  })

  it('404s when the list is missing, without deleting', async () => {
    listFindUnique.mockResolvedValue(null)
    await expect(deleteShoppingList('l1')).rejects.toMatchObject({ status: 404 })
    expect(listDelete).not.toHaveBeenCalled()
  })
})

describe('archiveShoppingList guards', () => {
  it('404s when the list is missing', async () => {
    listFindUnique.mockResolvedValue(null)
    await expect(
      archiveShoppingList('l1', { pantryEntries: [], rolloverItemIds: [] }, 'u1'),
    ).rejects.toMatchObject({ status: 404 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects a list that is already archived', async () => {
    listFindUnique.mockResolvedValue({ ...activeList, status: 'ARCHIVED' })
    await expect(
      archiveShoppingList('l1', { pantryEntries: [], rolloverItemIds: [] }, 'u1'),
    ).rejects.toMatchObject({ status: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects a pantry entry referencing an item not on the list', async () => {
    listFindUnique.mockResolvedValue(activeList)
    await expect(
      archiveShoppingList(
        'l1',
        { pantryEntries: [{ shoppingItemId: 'nope', locationId: 'loc1' }], rolloverItemIds: [] },
        'u1',
      ),
    ).rejects.toMatchObject({ status: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects a rollover item not on the list', async () => {
    listFindUnique.mockResolvedValue(activeList)
    await expect(
      archiveShoppingList('l1', { pantryEntries: [], rolloverItemIds: ['nope'] }, 'u1'),
    ).rejects.toMatchObject({ status: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects an unknown storage location', async () => {
    listFindUnique.mockResolvedValue(activeList)
    locationCount.mockResolvedValue(0) // none of the referenced locations exist
    await expect(
      archiveShoppingList(
        'l1',
        { pantryEntries: [{ shoppingItemId: 'si1', locationId: 'loc1' }], rolloverItemIds: [] },
        'u1',
      ),
    ).rejects.toMatchObject({ status: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })
})

describe('mergeOrCreateLine', () => {
  const base = { itemId: 'it1', userId: 'u1' }

  it('creates a fresh line with a single source when nothing matches', async () => {
    const tx = txWith([])
    await mergeOrCreateLine(tx as never, 'l1', {
      ...base,
      quantity: 2,
      unit: 'g',
      source: 'MANUAL',
    })
    expect(tx.shoppingListItem.create).toHaveBeenCalledOnce()
    expect(tx.shoppingListItem.create.mock.calls[0][0].data).toMatchObject({
      itemId: 'it1',
      quantity: 2,
      unit: 'g',
      sources: ['MANUAL'],
    })
  })

  it('sums same-unit lines and unions the source', async () => {
    const tx = txWith([
      line({ quantity: 2, unit: 'g', sources: ['MANUAL'], item: { baseUnit: 'g' } }),
    ])
    await mergeOrCreateLine(tx as never, 'l1', {
      ...base,
      quantity: 3,
      unit: 'g',
      source: 'MEAL_PLAN',
    })
    expect(tx.shoppingListItem.create).not.toHaveBeenCalled()
    expect(tx.shoppingListItem.update.mock.calls[0][0].data).toMatchObject({
      quantity: 5,
      unit: 'g',
      sources: { set: ['MANUAL', 'MEAL_PLAN'] },
    })
  })

  it('does not duplicate a source already on the line', async () => {
    const tx = txWith([
      line({ quantity: 2, unit: 'g', sources: ['MANUAL'], item: { baseUnit: 'g' } }),
    ])
    await mergeOrCreateLine(tx as never, 'l1', {
      ...base,
      quantity: 1,
      unit: 'g',
      source: 'MANUAL',
    })
    const data = tx.shoppingListItem.update.mock.calls[0][0].data
    expect(data.quantity).toBe(3)
    expect(data.sources).toBeUndefined() // source unchanged, so no set
  })

  it('sums compatible different units in the base unit', async () => {
    const tx = txWith([
      line({ quantity: 1, unit: 'kg', sources: ['MANUAL'], item: { baseUnit: 'g' } }),
    ])
    await mergeOrCreateLine(tx as never, 'l1', {
      ...base,
      quantity: 200,
      unit: 'g',
      source: 'MEAL_PLAN',
    })
    expect(tx.shoppingListItem.update.mock.calls[0][0].data).toMatchObject({
      quantity: 1200, // 1kg → 1000g + 200g
      unit: 'g',
    })
  })

  it('keeps incompatible units as a separate line', async () => {
    const tx = txWith([
      line({ quantity: 2, unit: 'g', sources: ['MANUAL'], item: { baseUnit: 'g' } }),
    ])
    await mergeOrCreateLine(tx as never, 'l1', {
      ...base,
      quantity: 1,
      unit: 'unit',
      source: 'CONSUMABLES',
    })
    expect(tx.shoppingListItem.update).not.toHaveBeenCalled()
    expect(tx.shoppingListItem.create.mock.calls[0][0].data).toMatchObject({
      quantity: 1,
      unit: 'unit',
      sources: ['CONSUMABLES'],
    })
  })

  it('merges into a line with an unspecified quantity, keeping the concrete one', async () => {
    const tx = txWith([
      line({ quantity: null, unit: null, sources: ['MANUAL'], item: { baseUnit: null } }),
    ])
    await mergeOrCreateLine(tx as never, 'l1', {
      ...base,
      quantity: 4,
      unit: 'pack',
      source: 'MEAL_PLAN',
    })
    expect(tx.shoppingListItem.update.mock.calls[0][0].data).toMatchObject({
      quantity: 4,
      unit: 'pack',
      sources: { set: ['MANUAL', 'MEAL_PLAN'] },
    })
  })
})
