import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  normaliseKey,
  parseAddressSearch,
  parseRecordPage,
} from '../councils/south-lanarkshire/parse.js'

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)), 'utf8')
}

describe('normaliseKey', () => {
  it('reduces both spellings of a bin to the same colour key', () => {
    expect(normaliseKey('Burgundy - Food and garden')).toBe('burgundy')
    expect(normaliseKey('Black/green bin - non-recyclable waste')).toBe('black/green')
    expect(normaliseKey('Black/Green - Non Recyclable Waste')).toBe('black/green')
    expect(normaliseKey('Blue (paper and card)')).toBe('blue')
    expect(normaliseKey('Light Grey - Glass, cans and plastics')).toBe('light grey')
  })
})

describe('parseRecordPage (real fixture)', () => {
  const obs = parseRecordPage(fixture('south-lanarkshire-record.html'))

  it('reads the observed week window', () => {
    expect(obs.weekStart.toISOString().slice(0, 10)).toBe('2026-06-22')
    expect(obs.weekEnd.toISOString().slice(0, 10)).toBe('2026-06-26')
    expect(obs.area).toBe('Hamilton')
  })

  it('reads every bin with weekday and frequency', () => {
    expect(obs.bins).toHaveLength(4)
    const burgundy = obs.bins.find((b) => b.key === 'burgundy')
    expect(burgundy).toMatchObject({ weekday: 2, frequencyDays: 14 })
    const blue = obs.bins.find((b) => b.key === 'blue')
    expect(blue).toMatchObject({ weekday: 2, frequencyDays: 28 })
  })

  it('flags only the bins listed as out this week', () => {
    const out = obs.bins.filter((b) => b.outThisWeek).map((b) => b.key)
    expect(out).toEqual(['black/green'])
  })
})

describe('parseAddressSearch (real fixture)', () => {
  const addresses = parseAddressSearch(fixture('south-lanarkshire-search.html'))

  it('extracts address ids, labels and urls', () => {
    expect(addresses.length).toBeGreaterThanOrEqual(10)
    expect(addresses[0]).toEqual({
      id: '580009',
      label: 'Angle Street, Stonehouse',
      url: 'https://www.southlanarkshire.gov.uk/directory_record/580009/angle_street_stonehouse',
    })
  })

  it('de-duplicates repeated record links', () => {
    const ids = addresses.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
