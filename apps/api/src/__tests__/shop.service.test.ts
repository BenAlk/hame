import { describe, it, expect, vi, beforeEach } from 'vitest'

const shopFindMany = vi.fn()
const shopFindFirst = vi.fn()
const shopFindUnique = vi.fn()
const shopCreate = vi.fn()
const shopUpdate = vi.fn()
const shopDelete = vi.fn()
const itemCreate = vi.fn()
const itemUpdate = vi.fn()
const itemFindUnique = vi.fn()
const itemFindFirst = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    shop: {
      findMany: shopFindMany,
      findFirst: shopFindFirst,
      findUnique: shopFindUnique,
      create: shopCreate,
      update: shopUpdate,
      delete: shopDelete,
    },
    item: {
      create: itemCreate,
      update: itemUpdate,
      findUnique: itemFindUnique,
      findFirst: itemFindFirst,
    },
  },
}))

const { listShops, createShop, updateShop, deleteShop } =
  await import('../services/shop.service.js')
const { createItem, updateItem, toItem } = await import('../services/item.service.js')

const lidl = { id: 's1', name: 'Lidl', colour: '#2f6fb0', createdAt: new Date() }

beforeEach(() => {
  for (const m of [
    shopFindMany,
    shopFindFirst,
    shopFindUnique,
    shopCreate,
    shopUpdate,
    shopDelete,
    itemCreate,
    itemUpdate,
    itemFindUnique,
    itemFindFirst,
  ]) {
    m.mockReset()
  }
})

describe('shop service', () => {
  it('maps shops to the public shape', async () => {
    shopFindMany.mockResolvedValue([lidl])
    expect(await listShops()).toEqual([{ id: 's1', name: 'Lidl', colour: '#2f6fb0' }])
  })

  it('trims the name on create', async () => {
    shopFindFirst.mockResolvedValue(null)
    shopCreate.mockResolvedValue(lidl)
    await createShop({ name: '  Lidl  ' })
    expect(shopCreate).toHaveBeenCalledWith({ data: { name: 'Lidl', colour: null } })
  })

  it('refuses a duplicate name regardless of case', async () => {
    shopFindFirst.mockResolvedValue(lidl)
    await expect(createShop({ name: 'lidl' })).rejects.toThrow(/exists/i)
    expect(shopCreate).not.toHaveBeenCalled()
  })

  it('allows a rename that collides only with itself', async () => {
    shopFindUnique.mockResolvedValue(lidl)
    shopFindFirst.mockResolvedValue(lidl)
    shopUpdate.mockResolvedValue({ ...lidl, colour: '#000000' })
    await expect(updateShop('s1', { name: 'Lidl', colour: '#000000' })).resolves.toBeTruthy()
  })

  /**
   * The behavioural heart of §8.3: the FK is `SetNull`, so a shop in use is
   * still deletable — "we stopped shopping there" must not delete products.
   */
  it('deletes a shop that items still reference', async () => {
    shopFindUnique.mockResolvedValue(lidl)
    shopDelete.mockResolvedValue(lidl)
    await expect(deleteShop('s1')).resolves.toBeUndefined()
    expect(shopDelete).toHaveBeenCalledWith({ where: { id: 's1' } })
  })

  it('404s deleting an unknown shop', async () => {
    shopFindUnique.mockResolvedValue(null)
    await expect(deleteShop('nope')).rejects.toThrow(/not found/i)
  })
})

describe('item shop assignment', () => {
  const baseItem = {
    id: 'i1',
    name: 'Coffee',
    defaultQuantity: null,
    defaultUnit: null,
    baseUnit: 'g',
    typicalUnitGrams: null,
    minimumQuantity: null,
    isStaple: false,
    isConsumable: false,
    reorderIntervalDays: null,
    shopId: null,
    shop: null,
    sectionId: null,
    section: null,
    tags: [],
    createdById: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('expands the shop onto the public item shape', () => {
    expect(toItem({ ...baseItem, shop: lidl }).shop).toEqual({
      id: 's1',
      name: 'Lidl',
      colour: '#2f6fb0',
    })
    expect(toItem(baseItem).shop).toBeNull()
  })

  it('defaults a new item to no shop', async () => {
    itemFindFirst.mockResolvedValue(null)
    itemCreate.mockResolvedValue(baseItem)
    await createItem({ name: 'Coffee' }, 'u1')
    expect(itemCreate.mock.calls[0][0].data.shopId).toBeNull()
  })

  it('sets a shop on create when given', async () => {
    itemFindFirst.mockResolvedValue(null)
    itemCreate.mockResolvedValue(baseItem)
    await createItem({ name: 'Coffee', shopId: 's1' }, 'u1')
    expect(itemCreate.mock.calls[0][0].data.shopId).toBe('s1')
  })

  /** null is meaningful — it clears the shop back to "buy anywhere". */
  it('clears the shop when passed null, and leaves it alone when omitted', async () => {
    itemFindUnique.mockResolvedValue(baseItem)
    itemUpdate.mockResolvedValue(baseItem)

    await updateItem('i1', { shopId: null })
    expect(itemUpdate.mock.calls[0][0].data).toHaveProperty('shopId', null)

    await updateItem('i1', { name: 'Coffee beans' })
    expect(itemUpdate.mock.calls[1][0].data).not.toHaveProperty('shopId')
  })
})
