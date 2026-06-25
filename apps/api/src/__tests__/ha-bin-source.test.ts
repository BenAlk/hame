import { describe, it, expect } from 'vitest'
import type { HaEntityState } from '@hame/shared'
import {
  binGroupKey,
  binSensorScore,
  haBinProvider,
  haEntityToBinOccurrences,
  isBinSensor,
  parseBinSensorDate,
  readBinSensorDate,
} from '../integrations/bin-sources/ha-bin-source.js'

/** A horizon spanning all of 2026, so the fixtures' dates fall inside it. */
const horizon = { start: new Date('2026-01-01'), end: new Date('2026-12-31') }

function sensor(overrides: Partial<HaEntityState> = {}): HaEntityState {
  return {
    entityId: 'sensor.bromley_general_waste',
    domain: 'sensor',
    state: '2026-06-16',
    friendlyName: 'General Waste',
    attributes: {},
    lastChanged: null,
    ...overrides,
  }
}

describe('parseBinSensorDate', () => {
  it('parses ISO YYYY-MM-DD to UTC midnight', () => {
    expect(parseBinSensorDate('2026-06-16')?.toISOString()).toBe('2026-06-16T00:00:00.000Z')
  })

  it('parses the date part of an ISO datetime', () => {
    expect(parseBinSensorDate('2026-06-16T07:30:00+01:00')?.toISOString()).toBe(
      '2026-06-16T00:00:00.000Z',
    )
  })

  it('parses UK day-first DD/MM/YYYY and DD-MM-YYYY', () => {
    expect(parseBinSensorDate('16/06/2026')?.toISOString()).toBe('2026-06-16T00:00:00.000Z')
    expect(parseBinSensorDate('6-6-2026')?.toISOString()).toBe('2026-06-06T00:00:00.000Z')
  })

  it('rejects impossible and non-date values', () => {
    expect(parseBinSensorDate('31/02/2026')).toBeNull()
    expect(parseBinSensorDate('Tomorrow')).toBeNull()
    expect(parseBinSensorDate('3')).toBeNull() // a days-count, not a date
    expect(parseBinSensorDate(3)).toBeNull()
    expect(parseBinSensorDate('')).toBeNull()
  })
})

describe('readBinSensorDate', () => {
  it('prefers a next-collection attribute over the state', () => {
    const date = readBinSensorDate(
      sensor({ state: 'in 2 days', attributes: { next_collection: '2026-06-16' } }),
    )
    expect(date?.toISOString()).toBe('2026-06-16T00:00:00.000Z')
  })

  it('matches attribute keys regardless of case/spacing', () => {
    const date = readBinSensorDate(
      sensor({ state: 'x', attributes: { 'Next Collection': '16/06/2026' } }),
    )
    expect(date?.toISOString()).toBe('2026-06-16T00:00:00.000Z')
  })

  it('falls back to the state when no attribute carries a date', () => {
    const date = readBinSensorDate(sensor({ state: '2026-06-16', attributes: { days: 2 } }))
    expect(date?.toISOString()).toBe('2026-06-16T00:00:00.000Z')
  })

  it('returns null when nothing parses', () => {
    expect(readBinSensorDate(sensor({ state: 'Unknown', attributes: {} }))).toBeNull()
  })
})

describe('isBinSensor', () => {
  it('matches bin/waste-shaped sensor ids and names', () => {
    expect(isBinSensor(sensor({ entityId: 'sensor.bromley_general_waste' }))).toBe(true)
    expect(
      isBinSensor(sensor({ entityId: 'sensor.next_thing', friendlyName: 'Recycling collection' })),
    ).toBe(true)
  })

  it('rejects unrelated sensors and non-sensor domains', () => {
    expect(
      isBinSensor(sensor({ entityId: 'sensor.kitchen_temperature', friendlyName: 'Temp' })),
    ).toBe(false)
    expect(isBinSensor(sensor({ entityId: 'light.bin_store', domain: 'light' }))).toBe(false)
  })
})

describe('binGroupKey / binSensorScore', () => {
  // The entities the UK Bin Collection Data integration exposes for one bin —
  // the bare device sensor plus its per-facet ones (real HA names).
  const facets = [
    'Home Burgundy - Food and garden',
    'Home Burgundy - Food and garden Colour',
    'Home Burgundy - Food and garden Bin Type',
    'Home Burgundy - Food and garden Days Until Collection',
    'Home Burgundy - Food and garden Next Collection Date',
    'Home Burgundy - Food and garden Next Collection Human Readable',
  ]

  it('collapses a bin’s several sensors to one group key', () => {
    const keys = new Set(facets.map((name) => binGroupKey(sensor({ friendlyName: name }))))
    expect([...keys]).toEqual(['Home Burgundy - Food and garden'])
  })

  it('scores the dedicated next-collection-date sensor highest', () => {
    const dateSensor = sensor({
      friendlyName: 'Home Burgundy - Food and garden Next Collection Date',
      state: '30/06/2026',
    })
    const daysUntil = sensor({
      friendlyName: 'Home Burgundy - Food and garden Days Until Collection',
      state: '4',
      attributes: { next_collection: '2026-06-30' },
    })
    expect(binSensorScore(dateSensor)).toBeGreaterThan(binSensorScore(daysUntil))
  })

  it('ranks an unavailable date sensor above other unavailable facets', () => {
    // A bin HA hasn't resolved: every facet is `unavailable`, but the dedicated
    // date sensor still wins on its name, so its id is the one we'd store.
    const dateSensor = sensor({
      friendlyName: 'Home Black/Green - Non Recyclable Waste Next Collection Date',
      state: 'unavailable',
    })
    const colour = sensor({
      friendlyName: 'Home Black/Green - Non Recyclable Waste Colour',
      state: 'unavailable',
    })
    expect(binSensorScore(dateSensor)).toBeGreaterThan(binSensorScore(colour))
  })
})

describe('haEntityToBinOccurrences', () => {
  it('maps the sensor to a single UTC-midnight occurrence', () => {
    const out = haEntityToBinOccurrences(sensor({ state: '2026-06-16' }), horizon)
    expect(out).toEqual([{ date: new Date('2026-06-16T00:00:00.000Z') }])
  })

  it('throws (keeping the cache) when no date is readable', () => {
    expect(() => haEntityToBinOccurrences(sensor({ state: 'Unknown' }), horizon)).toThrow()
  })

  it('throws when the date falls outside the sync window', () => {
    expect(() => haEntityToBinOccurrences(sensor({ state: '2025-06-16' }), horizon)).toThrow(
      /sync window/,
    )
  })
})

describe('haBinProvider', () => {
  it('rejects when Home Assistant is not connected', async () => {
    await expect(
      haBinProvider.fetchOccurrences({ entityId: 'sensor.bromley_general_waste' }, horizon),
    ).rejects.toThrow(/not connected/)
  })

  it('rejects when no entity id is configured', async () => {
    await expect(haBinProvider.fetchOccurrences({}, horizon)).rejects.toThrow(/entity is required/)
  })
})
