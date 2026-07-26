import { describe, it, expect, vi, beforeEach } from 'vitest'

const barcodeFindUnique = vi.fn()
const barcodeUpsert = vi.fn()
const barcodeDelete = vi.fn()
const itemFindUnique = vi.fn()
const itemFindFirst = vi.fn()
const itemCreate = vi.fn()
const settingsUpsert = vi.fn()
const lookupBarcode = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    itemBarcode: {
      findUnique: barcodeFindUnique,
      upsert: barcodeUpsert,
      delete: barcodeDelete,
    },
    item: { findUnique: itemFindUnique, findFirst: itemFindFirst, create: itemCreate },
    householdSettings: { upsert: settingsUpsert },
  },
}))
vi.mock('../integrations/open-food-facts/index.js', () => ({ lookupBarcode }))

const { resolveBarcode, linkBarcode, unlinkBarcode } =
  await import('../services/barcode.service.js')

const item = {
  id: 'i1',
  name: 'Milk',
  defaultQuantity: 1,
  defaultUnit: 'bottle',
  baseUnit: 'ml',
  typicalUnitGrams: null,
  minimumQuantity: null,
  isStaple: false,
  isConsumable: false,
  reorderIntervalDays: null,
  shopId: null,
  shop: null,
  tags: [],
  createdById: 'u1',
  createdAt: new Date(),
  updatedAt: new Date(),
}

function settings(barcodeLookupEnabled: boolean) {
  return {
    id: 'singleton',
    enabledMealTypes: ['DINNER'],
    ingredientNormaliser: 'BASIC',
    caldavEnabled: false,
    autoConsumableCadence: false,
    householdAlertsEnabled: true,
    barcodeLookupEnabled,
    updatedAt: new Date(),
  }
}

beforeEach(() => {
  for (const m of [
    barcodeFindUnique,
    barcodeUpsert,
    barcodeDelete,
    itemFindUnique,
    itemFindFirst,
    itemCreate,
    settingsUpsert,
    lookupBarcode,
  ]) {
    m.mockReset()
  }
  settingsUpsert.mockResolvedValue(settings(true))
})

describe('resolveBarcode', () => {
  /** The point of the local library: a known code never leaves the network. */
  it('returns the linked item without any external lookup', async () => {
    barcodeFindUnique.mockResolvedValue({ code: '5000112637922', item })

    const result = await resolveBarcode('5000112637922')

    expect(result.item?.name).toBe('Milk')
    expect(result.suggestion).toBeNull()
    expect(lookupBarcode).not.toHaveBeenCalled()
  })

  it('falls back to an external lookup for an unseen code', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    lookupBarcode.mockResolvedValue({ name: 'Oat Milk', brand: 'Alpro', quantity: '1 l' })

    const result = await resolveBarcode('5000112637922')

    expect(result.item).toBeNull()
    expect(result.suggestion?.name).toBe('Oat Milk')
    expect(lookupBarcode).toHaveBeenCalledWith('5000112637922')
  })

  /** Turning the toggle off must stop the outbound call, not just hide the result. */
  it('makes no external call when the household has lookup off', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    settingsUpsert.mockResolvedValue(settings(false))

    const result = await resolveBarcode('5000112637922')

    expect(result.suggestion).toBeNull()
    expect(result.lookupEnabled).toBe(false)
    expect(lookupBarcode).not.toHaveBeenCalled()
  })

  /** A lookup miss is not an error — the name gets typed and the code still learned. */
  it('resolves to nothing when the lookup finds no product', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    lookupBarcode.mockResolvedValue(null)

    const result = await resolveBarcode('5000112637922')

    expect(result.item).toBeNull()
    expect(result.suggestion).toBeNull()
    expect(result.lookupEnabled).toBe(true)
  })
})

describe('linkBarcode', () => {
  it('links to an existing item', async () => {
    itemFindUnique.mockResolvedValue(item)
    await linkBarcode({ code: '5000112637922', itemId: 'i1', label: 'Lidl Milk' }, 'u1')
    expect(barcodeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: '5000112637922' },
        create: { code: '5000112637922', itemId: 'i1', label: 'Lidl Milk' },
      }),
    )
  })

  it('mints an item when linking by name', async () => {
    itemFindFirst.mockResolvedValue(null)
    itemCreate.mockResolvedValue({ ...item, id: 'i2' })
    await linkBarcode({ code: '5000112637922', itemName: 'Oat Milk' }, 'u1')
    expect(barcodeUpsert.mock.calls[0][0].create.itemId).toBe('i2')
  })

  it('rejects linking to an item that does not exist', async () => {
    itemFindUnique.mockResolvedValue(null)
    await expect(linkBarcode({ code: '5000112637922', itemId: 'gone' }, 'u1')).rejects.toThrow(
      /not found/i,
    )
    expect(barcodeUpsert).not.toHaveBeenCalled()
  })

  /** Rescanning something filed wrongly is how you correct it. */
  it('re-points an already-known code rather than failing', async () => {
    itemFindUnique.mockResolvedValue(item)
    await linkBarcode({ code: '5000112637922', itemId: 'i1' }, 'u1')
    expect(barcodeUpsert.mock.calls[0][0].update).toEqual({ itemId: 'i1', label: null })
  })
})

describe('unlinkBarcode', () => {
  it('404s on an unknown code', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    await expect(unlinkBarcode('5000112637922')).rejects.toThrow(/not found/i)
  })
})
