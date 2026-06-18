import { describe, it, expect, vi, beforeEach } from 'vitest'

const listFindUnique = vi.fn()
const locationCount = vi.fn()
const transaction = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    shoppingList: { findUnique: listFindUnique },
    storageLocation: { count: locationCount },
    $transaction: transaction,
  },
}))

const { archiveShoppingList } = await import('../services/shopping.service.js')

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
  for (const fn of [listFindUnique, locationCount, transaction]) fn.mockReset()
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
