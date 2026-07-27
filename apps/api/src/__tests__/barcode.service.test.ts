import { describe, it, expect, vi, beforeEach } from 'vitest'

const barcodeFindUnique = vi.fn()
const barcodeUpsert = vi.fn()
const barcodeDelete = vi.fn()
const itemFindUnique = vi.fn()
const itemFindFirst = vi.fn()
const itemFindMany = vi.fn()
const itemCreate = vi.fn()
const settingsUpsert = vi.fn()
const lookupBarcode = vi.fn()
const getLlm = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    itemBarcode: {
      findUnique: barcodeFindUnique,
      upsert: barcodeUpsert,
      delete: barcodeDelete,
    },
    item: {
      findUnique: itemFindUnique,
      findFirst: itemFindFirst,
      findMany: itemFindMany,
      create: itemCreate,
    },
    householdSettings: { upsert: settingsUpsert },
  },
}))
// The real `stripBrand` is kept: it's the deterministic floor under the model,
// so these tests should exercise it rather than a stand-in.
vi.mock('../integrations/open-food-facts/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../integrations/open-food-facts/index.js')>()),
  lookupBarcode,
}))
vi.mock('../services/normaliser.service.js', () => ({ getLlm }))

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
    itemFindMany,
    itemCreate,
    settingsUpsert,
    lookupBarcode,
    getLlm,
  ]) {
    m.mockReset()
  }
  settingsUpsert.mockResolvedValue(settings(true))
  // No model configured is the default: everything below must work without one.
  getLlm.mockResolvedValue(null)
  itemFindMany.mockResolvedValue([])
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

describe('resolveBarcode — canonical name and match', () => {
  const branded = { name: 'Tesco British Semi Skimmed Milk 2.272L', brand: 'Tesco', quantity: null }

  it('strips the brand and pack size without a model', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    lookupBarcode.mockResolvedValue(branded)

    const result = await resolveBarcode('5000112637922')

    expect(result.canonicalName).toBe('British Semi Skimmed Milk')
    // The packet name survives untouched for the label.
    expect(result.suggestion?.name).toBe(branded.name)
  })

  it('prefers the model canonical name over the deterministic strip', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    lookupBarcode.mockResolvedValue(branded)
    const canonicaliseProduct = vi.fn().mockResolvedValue('semi skimmed milk')
    getLlm.mockResolvedValue({ canonicaliseProduct })

    const result = await resolveBarcode('5000112637922')

    expect(canonicaliseProduct).toHaveBeenCalledWith(branded.name)
    expect(result.canonicalName).toBe('semi skimmed milk')
  })

  it('falls back to the strip when the model gives nothing', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    lookupBarcode.mockResolvedValue(branded)
    getLlm.mockResolvedValue({ canonicaliseProduct: vi.fn().mockResolvedValue(null) })

    const result = await resolveBarcode('5000112637922')

    expect(result.canonicalName).toBe('British Semi Skimmed Milk')
  })

  /** The whole point: a second brand of milk stocks the milk already there. */
  it('matches an existing item so a brand does not become a new one', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    lookupBarcode.mockResolvedValue(branded)
    getLlm.mockResolvedValue({ canonicaliseProduct: vi.fn().mockResolvedValue('milk') })
    itemFindMany.mockResolvedValue([item])

    const result = await resolveBarcode('5000112637922')

    expect(result.match?.name).toBe('Milk')
    // Offered, not applied — nothing is linked until the batch is committed.
    expect(result.item).toBeNull()
  })

  it('ranks a canonical match above a packet-name one', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    lookupBarcode.mockResolvedValue(branded)
    getLlm.mockResolvedValue({ canonicaliseProduct: vi.fn().mockResolvedValue('milk') })
    // Both exist; the order the database returns them in must not decide.
    itemFindMany.mockResolvedValue([{ ...item, id: 'i2', name: branded.name }, item])

    const result = await resolveBarcode('5000112637922')

    expect(result.match?.id).toBe('i1')
  })

  it('leaves both null when there was no suggestion to work from', async () => {
    barcodeFindUnique.mockResolvedValue(null)
    lookupBarcode.mockResolvedValue(null)

    const result = await resolveBarcode('5000112637922')

    expect(result.canonicalName).toBeNull()
    expect(result.match).toBeNull()
    expect(itemFindMany).not.toHaveBeenCalled()
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
