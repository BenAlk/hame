import { describe, it, expect, vi, beforeEach } from 'vitest'

const sectionFindMany = vi.fn()
const sectionFindFirst = vi.fn()
const sectionFindUnique = vi.fn()
const sectionCreate = vi.fn()
const sectionUpdate = vi.fn()
const sectionDelete = vi.fn()
const itemCreate = vi.fn()
const itemUpdate = vi.fn()
const itemFindUnique = vi.fn()
const itemFindFirst = vi.fn()
const transaction = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    section: {
      findMany: sectionFindMany,
      findFirst: sectionFindFirst,
      findUnique: sectionFindUnique,
      create: sectionCreate,
      update: sectionUpdate,
      delete: sectionDelete,
    },
    item: {
      create: itemCreate,
      update: itemUpdate,
      findUnique: itemFindUnique,
      findFirst: itemFindFirst,
    },
    $transaction: transaction,
  },
}))

const { listSections, createSection, updateSection, reorderSections, deleteSection } =
  await import('../services/section.service.js')
const { createItem, updateItem, toItem } = await import('../services/item.service.js')

const row = (id: string, name: string, position: number) => ({
  id,
  name,
  colour: '#9aa0a6',
  position,
  createdAt: new Date(),
})

const produce = row('sec1', 'Produce', 1)
const dairy = row('sec2', 'Dairy', 5)

beforeEach(() => {
  for (const m of [
    sectionFindMany,
    sectionFindFirst,
    sectionFindUnique,
    sectionCreate,
    sectionUpdate,
    sectionDelete,
    itemCreate,
    itemUpdate,
    itemFindUnique,
    itemFindFirst,
    transaction,
  ]) {
    m.mockReset()
  }
  transaction.mockResolvedValue([])
})

describe('listSections', () => {
  /** Walking order is the point; name is only the tie-break. */
  it('orders by position, then name', async () => {
    sectionFindMany.mockResolvedValue([produce, dairy])
    await listSections()
    expect(sectionFindMany.mock.calls[0][0].orderBy).toEqual([{ position: 'asc' }, { name: 'asc' }])
  })
})

describe('createSection', () => {
  it('puts a new section at the end of the walk', async () => {
    sectionFindFirst.mockResolvedValueOnce(null) // name is free
    sectionFindFirst.mockResolvedValueOnce(dairy) // current last, position 5
    sectionCreate.mockResolvedValue(row('sec3', 'Frozen', 6))
    await createSection({ name: 'Frozen' })
    expect(sectionCreate.mock.calls[0][0].data.position).toBe(6)
  })

  it('starts at 1 when there are no sections yet', async () => {
    sectionFindFirst.mockResolvedValueOnce(null)
    sectionFindFirst.mockResolvedValueOnce(null)
    sectionCreate.mockResolvedValue(row('sec1', 'Produce', 1))
    await createSection({ name: 'Produce' })
    expect(sectionCreate.mock.calls[0][0].data.position).toBe(1)
  })

  it('refuses a duplicate name, case-insensitively', async () => {
    sectionFindFirst.mockResolvedValue(dairy)
    await expect(createSection({ name: 'dairy' })).rejects.toThrow(/exists/i)
  })
})

describe('updateSection', () => {
  it('rejects an unknown section', async () => {
    sectionFindUnique.mockResolvedValue(null)
    await expect(updateSection('nope', { name: 'Bakery' })).rejects.toThrow(/not found/i)
  })
})

describe('reorderSections', () => {
  it('reassigns positions from 1 in the order given', async () => {
    sectionFindMany.mockResolvedValue([produce, dairy])
    await reorderSections({ ids: ['sec2', 'sec1'] })
    // One transaction, so the list never renders mid-reorder.
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(sectionUpdate.mock.calls.map(([arg]) => [arg.where.id, arg.data.position])).toEqual([
      ['sec2', 1],
      ['sec1', 2],
    ])
  })

  /** A partial order must not strand the sections it left out. */
  it('keeps unlisted sections after the ones listed', async () => {
    sectionFindMany.mockResolvedValue([produce, dairy])
    await reorderSections({ ids: ['sec2'] })
    expect(sectionUpdate.mock.calls.map(([arg]) => [arg.where.id, arg.data.position])).toEqual([
      ['sec2', 1],
      ['sec1', 2],
    ])
  })

  it('rejects an id that is not a section', async () => {
    sectionFindMany.mockResolvedValue([produce])
    await expect(reorderSections({ ids: ['ghost'] })).rejects.toThrow(/not found/i)
  })
})

describe('deleteSection', () => {
  /**
   * Deliberately not blocked while in use: the FK is SetNull, so items fall back
   * to the "Other" group. Rearranging a shop must not delete its products.
   */
  it('deletes a section that items still reference', async () => {
    sectionFindUnique.mockResolvedValue(dairy)
    await deleteSection('sec2')
    expect(sectionDelete).toHaveBeenCalledWith({ where: { id: 'sec2' } })
  })

  it('rejects an unknown section', async () => {
    sectionFindUnique.mockResolvedValue(null)
    await expect(deleteSection('nope')).rejects.toThrow(/not found/i)
  })
})

describe('item section assignment', () => {
  const baseItem = {
    id: 'i1',
    name: 'Milk',
    defaultQuantity: null,
    defaultUnit: null,
    baseUnit: 'ml',
    typicalUnitGrams: null,
    minimumQuantity: null,
    isStaple: false,
    isConsumable: false,
    reorderIntervalDays: null,
    storageType: null,
    shopId: null,
    shop: null,
    sectionId: null,
    section: null,
    tags: [],
    createdById: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('expands the section onto the public item shape, position included', () => {
    expect(toItem({ ...baseItem, section: dairy }).section).toEqual({
      id: 'sec2',
      name: 'Dairy',
      colour: '#9aa0a6',
      position: 5,
    })
    expect(toItem(baseItem).section).toBeNull()
  })

  it('defaults a new item to no section', async () => {
    itemFindFirst.mockResolvedValue(null)
    itemCreate.mockResolvedValue(baseItem)
    await createItem({ name: 'Milk' }, 'u1')
    expect(itemCreate.mock.calls[0][0].data.sectionId).toBeNull()
  })

  it('sets a section on create when given', async () => {
    itemFindFirst.mockResolvedValue(null)
    itemCreate.mockResolvedValue({ ...baseItem, sectionId: 'sec2' })
    await createItem({ name: 'Milk', sectionId: 'sec2' }, 'u1')
    expect(itemCreate.mock.calls[0][0].data.sectionId).toBe('sec2')
  })

  /** null is meaningful — it returns the item to the "Other" group. */
  it('clears the section when updated to null', async () => {
    itemFindUnique.mockResolvedValue(baseItem)
    itemUpdate.mockResolvedValue(baseItem)
    await updateItem('i1', { sectionId: null })
    expect(itemUpdate.mock.calls[0][0].data.sectionId).toBeNull()
  })

  it('leaves the section alone when the field is absent', async () => {
    itemFindUnique.mockResolvedValue(baseItem)
    itemUpdate.mockResolvedValue(baseItem)
    await updateItem('i1', { isStaple: true })
    expect(itemUpdate.mock.calls[0][0].data).not.toHaveProperty('sectionId')
  })
})
