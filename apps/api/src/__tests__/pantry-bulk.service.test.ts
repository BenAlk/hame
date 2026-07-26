import { describe, it, expect, vi, beforeEach } from 'vitest'

const locationFindUnique = vi.fn()
const entryCreate = vi.fn()
const transaction = vi.fn()
const findOrCreateItemByName = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    storageLocation: { findUnique: locationFindUnique },
    pantryEntry: { create: entryCreate },
    $transaction: transaction,
  },
}))
vi.mock('../services/item.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/item.service.js')>()),
  findOrCreateItemByName,
}))

const { createPantryEntries } = await import('../services/pantry.service.js')

beforeEach(() => {
  locationFindUnique.mockReset()
  entryCreate.mockReset()
  transaction.mockReset()
  findOrCreateItemByName.mockReset()

  locationFindUnique.mockResolvedValue({ id: 'loc1', name: 'Fridge' })
  // The create calls are collected by $transaction; the rows themselves are
  // mapped by code already covered elsewhere, so return an empty batch.
  entryCreate.mockImplementation((args: unknown) => args)
  transaction.mockResolvedValue([])
})

describe('createPantryEntries', () => {
  /**
   * The headline scan case: two of the same *new* product, kept apart for their
   * separate expiry dates. Resolving those names concurrently would race two
   * inserts against Item.name's unique index and fail the whole batch.
   */
  it('resolves a repeated new name once', async () => {
    findOrCreateItemByName.mockResolvedValue('i-new')

    await createPantryEntries(
      [
        { itemName: 'Smoke Yoghurt', locationId: 'loc1', quantity: 1 },
        { itemName: 'Smoke Yoghurt', locationId: 'loc1', quantity: 1 },
      ],
      'u1',
    )

    expect(findOrCreateItemByName).toHaveBeenCalledTimes(1)
    const created = transaction.mock.calls[0][0] as { data: { itemId: string } }[]
    expect(created.map((c) => c.data.itemId)).toEqual(['i-new', 'i-new'])
  })

  it('treats names differing only by case or padding as one item', async () => {
    findOrCreateItemByName.mockResolvedValue('i-new')

    await createPantryEntries(
      [
        { itemName: 'Oat Milk', locationId: 'loc1', quantity: 1 },
        { itemName: '  oat milk ', locationId: 'loc1', quantity: 1 },
      ],
      'u1',
    )

    expect(findOrCreateItemByName).toHaveBeenCalledTimes(1)
  })

  it('resolves distinct names separately and passes ids straight through', async () => {
    findOrCreateItemByName.mockResolvedValueOnce('i-a').mockResolvedValueOnce('i-b')

    await createPantryEntries(
      [
        { itemName: 'Bread', locationId: 'loc1', quantity: 1 },
        { itemName: 'Cheese', locationId: 'loc1', quantity: 1 },
        { itemId: 'i-existing', locationId: 'loc1', quantity: 1 },
      ],
      'u1',
    )

    expect(findOrCreateItemByName).toHaveBeenCalledTimes(2)
    const created = transaction.mock.calls[0][0] as { data: { itemId: string } }[]
    expect(created.map((c) => c.data.itemId)).toEqual(['i-a', 'i-b', 'i-existing'])
  })

  it('rejects the batch when a location is unknown', async () => {
    locationFindUnique.mockResolvedValue(null)
    await expect(
      createPantryEntries([{ itemName: 'Bread', locationId: 'nope', quantity: 1 }], 'u1'),
    ).rejects.toThrow(/location/i)
    expect(transaction).not.toHaveBeenCalled()
  })
})
