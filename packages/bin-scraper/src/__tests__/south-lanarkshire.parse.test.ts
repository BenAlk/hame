import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  normaliseKey,
  parseAddressSearch,
  parseRecordPage,
} from '../councils/south-lanarkshire/parse.js'
import { projectBinDates } from '../project.js'

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)), 'utf8')
}

describe('normaliseKey', () => {
  it('reduces both spellings of a bin to the same colour key', () => {
    expect(normaliseKey('Burgundy - Food and garden')).toBe('burgundy')
    expect(normaliseKey('Burgundy bin - food and garden waste')).toBe('burgundy')
    expect(normaliseKey('Black/green bin - non-recyclable waste')).toBe('black/green')
    expect(normaliseKey('Black/Green - Non Recyclable Waste')).toBe('black/green')
    expect(normaliseKey('Blue (paper and card)')).toBe('blue')
  })

  it('drops the shade qualifier the two spellings disagree about', () => {
    // The table says "Light Grey", the snippet says "Grey" — keeping the
    // qualifier left the bin permanently unmatched, and so never out this week.
    expect(normaliseKey('Light Grey - Glass, cans and plastics')).toBe('grey')
    expect(normaliseKey('Grey bin - glass, cans and plastics')).toBe('grey')
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

describe('parseRecordPage — a 4-weekly bin out this week (real fixture)', () => {
  // The same street as the fixture above, read on a week when the 4-weekly grey
  // bin is out alongside the fortnightly burgundy one. The original fixture only
  // ever had a fortnightly bin out, so nothing exercised this path.
  const obs = parseRecordPage(fixture('south-lanarkshire-record-4weekly-out.html'))

  it('reads the observed week window', () => {
    expect(obs.weekStart.toISOString().slice(0, 10)).toBe('2026-08-10')
    expect(obs.weekEnd.toISOString().slice(0, 10)).toBe('2026-08-14')
  })

  it('flags every bin the snippet lists, across both spellings', () => {
    const out = obs.bins.filter((b) => b.outThisWeek).map((b) => b.key)
    expect(out).toEqual(['burgundy', 'grey'])
  })

  it('projects the 4-weekly bin from this reading alone, with no prior anchor', () => {
    const grey = obs.bins.find((b) => b.key === 'grey')
    expect(grey).toMatchObject({ weekday: 2, frequencyDays: 28 })
    const dates = projectBinDates(grey!, obs, { to: new Date('2026-09-30T00:00:00.000Z') })
    // Out this week ⇒ anchored to Tue 11 Aug, then every 28 days.
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-08-11', '2026-09-08'])
  })
})

describe('parseRecordPage — a "Town"-headed page (real fixture)', () => {
  // Cambuslang & Rutherglen head the round's row "Town" where every other zone
  // says "Area". This page also carries two rows that are not bin schedules.
  const obs = parseRecordPage(fixture('south-lanarkshire-record-town.html'))

  it('reads the round name from a "Town" row', () => {
    expect(obs.area).toBe('Cambuslang')
  })

  it('reads every bin on the page, including a non-colour one', () => {
    expect(obs.bins.map((b) => b.key)).toEqual(['black/green', 'burgundy', 'blue', 'grey', 'bulk'])
    // "Bulk Bin - Flats" collects on its own weekday and frequency.
    expect(obs.bins.find((b) => b.key === 'bulk')).toMatchObject({ weekday: 4, frequencyDays: 7 })
  })

  it('ignores a free-text row that is not a "Weekday (Frequency)" schedule', () => {
    // A "Comments" row reads "Household Waste (Black) : Non Recycling Properties
    // - Monday (Weekly)" — parenthesised and weekday-bearing, but not a schedule.
    expect(obs.bins.some((b) => /household|comment/i.test(b.name))).toBe(false)
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
