import { describe, it, expect } from 'vitest'
import type { BarcodeResolution, Item } from '@hame/shared'
import {
  isRowComplete,
  rowFromResolution,
  toBarcodeLinks,
  toPantryEntries,
  type ScannedRow,
} from './scan-batch'

const milk = {
  id: 'i1',
  name: 'Milk',
  defaultQuantity: 2,
  defaultUnit: 'bottle',
} as unknown as Item

function resolution(over: Partial<BarcodeResolution> = {}): BarcodeResolution {
  return {
    code: '5000112637922',
    item: null,
    suggestion: null,
    canonicalName: null,
    match: null,
    lookupEnabled: true,
    ...over,
  }
}

function row(over: Partial<ScannedRow> = {}): ScannedRow {
  return {
    key: 'k1',
    code: '5000112637922',
    label: null,
    itemId: 'i1',
    itemName: 'Milk',
    linked: true,
    quantity: 1,
    unit: null,
    expiry: '',
    ...over,
  }
}

describe('rowFromResolution', () => {
  it('pre-fills quantity and unit from a known item', () => {
    const result = rowFromResolution(resolution({ item: milk }), 'k1')
    expect(result).toMatchObject({ itemId: 'i1', itemName: 'Milk', linked: true, quantity: 2 })
    expect(result.unit).toBe('bottle')
  })

  it('pre-fills the name from a suggestion but does not treat it as linked', () => {
    const result = rowFromResolution(
      resolution({ suggestion: { name: 'Oat Milk', brand: 'Alpro', quantity: '1 l' } }),
      'k1',
    )
    expect(result).toMatchObject({ itemId: null, itemName: 'Oat Milk', label: 'Oat Milk' })
    expect(result.linked).toBe(false)
  })

  it('offers a matched existing item without treating it as already linked', () => {
    const result = rowFromResolution(
      resolution({
        suggestion: {
          name: 'Tesco British Semi Skimmed Milk 2.272L',
          brand: 'Tesco',
          quantity: null,
        },
        canonicalName: 'semi skimmed milk',
        match: milk,
      }),
      'k1',
    )
    // The existing item wins over the canonical name, so a second brand of milk
    // stocks the milk already there rather than minting a near-duplicate.
    expect(result).toMatchObject({ itemId: 'i1', itemName: 'Milk', quantity: 2 })
    // Still unlinked, so committing teaches this code against that item.
    expect(result.linked).toBe(false)
    // The packet name is kept as the label, so a multi-barcode item stays legible.
    expect(result.label).toBe('Tesco British Semi Skimmed Milk 2.272L')
  })

  it('pre-fills the canonical name over the packet name when nothing matched', () => {
    const result = rowFromResolution(
      resolution({
        suggestion: {
          name: 'Tesco British Semi Skimmed Milk 2.272L',
          brand: 'Tesco',
          quantity: null,
        },
        canonicalName: 'semi skimmed milk',
      }),
      'k1',
    )
    expect(result).toMatchObject({ itemId: null, itemName: 'semi skimmed milk' })
  })

  it('leaves the name blank when nothing is known', () => {
    expect(rowFromResolution(resolution(), 'k1')).toMatchObject({ itemName: '', label: null })
  })
})

describe('isRowComplete', () => {
  it('needs an item and a positive quantity', () => {
    expect(isRowComplete(row())).toBe(true)
    expect(isRowComplete(row({ itemId: null, itemName: '  ' }))).toBe(false)
    expect(isRowComplete(row({ quantity: 0 }))).toBe(false)
  })
})

describe('toPantryEntries', () => {
  /** The shared schema refuses both together, so exactly one must be sent. */
  it('sends itemId or itemName, never both', () => {
    const [byId, byName] = toPantryEntries(
      [row(), row({ key: 'k2', itemId: null, itemName: 'Oat Milk' })],
      'loc1',
    )
    expect(byId).toMatchObject({ itemId: 'i1' })
    expect(byId).not.toHaveProperty('itemName')
    expect(byName).toMatchObject({ itemName: 'Oat Milk' })
    expect(byName).not.toHaveProperty('itemId')
  })

  it('drops incomplete rows and applies the batch location', () => {
    const entries = toPantryEntries([row(), row({ key: 'k2', itemId: null, itemName: '' })], 'loc1')
    expect(entries).toHaveLength(1)
    expect(entries[0].locationId).toBe('loc1')
  })

  it('converts an expiry date and normalises a blank unit to null', () => {
    const [entry] = toPantryEntries([row({ expiry: '2026-08-01', unit: '  ' })], 'loc1')
    expect(entry.expiryDate).toEqual(new Date('2026-08-01'))
    expect(entry.unit).toBeNull()
  })

  /** Two scans of one product are two jars with their own expiry dates (§8.4). */
  it('keeps duplicate scans as separate entries', () => {
    expect(toPantryEntries([row(), row({ key: 'k2' })], 'loc1')).toHaveLength(2)
  })
})

describe('toBarcodeLinks', () => {
  it('ignores rows already linked to the item they ended up against', () => {
    expect(toBarcodeLinks([row()])).toEqual([])
  })

  it('links a newly matched code, carrying the looked-up label', () => {
    expect(toBarcodeLinks([row({ linked: false, label: 'Lidl Milk' })])).toEqual([
      { code: '5000112637922', itemId: 'i1', label: 'Lidl Milk' },
    ])
  })

  /** One code links once, and a later correction is the one that sticks. */
  it('deduplicates by code, last edit winning', () => {
    const links = toBarcodeLinks([
      row({ key: 'k1', linked: false, itemId: 'i1', itemName: 'Milk' }),
      row({ key: 'k2', linked: false, itemId: 'i2', itemName: 'Oat Milk' }),
    ])
    expect(links).toHaveLength(1)
    expect(links[0].itemId).toBe('i2')
  })

  it('skips incomplete rows', () => {
    expect(toBarcodeLinks([row({ linked: false, itemId: null, itemName: '' })])).toEqual([])
  })
})
