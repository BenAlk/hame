import { describe, it, expect } from 'vitest'
import {
  createScraperBins,
  listScraperAddressBins,
  listScraperCouncils,
  searchScraperAddresses,
} from '../services/bin.service.js'

describe('listScraperCouncils', () => {
  it('exposes the supported councils with a search hint for the picker', () => {
    const councils = listScraperCouncils()
    const slc = councils.find((c) => c.id === 'south-lanarkshire')
    expect(slc?.name).toBe('South Lanarkshire')
    expect(slc?.searchHint).toMatch(/street/i)
  })
})

describe('searchScraperAddresses', () => {
  it('rejects an unsupported council', async () => {
    await expect(searchScraperAddresses('narnia', 'high street')).rejects.toThrow(/not supported/i)
  })

  it('returns nothing for too-short a query (no network call)', async () => {
    await expect(searchScraperAddresses('south-lanarkshire', 'a')).resolves.toEqual([])
  })
})

describe('listScraperAddressBins', () => {
  it('rejects an unsupported council', async () => {
    await expect(listScraperAddressBins('narnia', '580009')).rejects.toThrow(/not supported/i)
  })

  it('requires an address id (no network call)', async () => {
    await expect(listScraperAddressBins('south-lanarkshire', '  ')).rejects.toThrow(/address/i)
  })
})

describe('createScraperBins', () => {
  it('rejects an unsupported council before any network call', async () => {
    await expect(
      createScraperBins({
        councilId: 'narnia',
        addressId: '580009',
        bins: [{ key: 'burgundy', name: 'Burgundy', colour: '#7d2b3e' }],
      }),
    ).rejects.toThrow(/not supported/i)
  })
})
