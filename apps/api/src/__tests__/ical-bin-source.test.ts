import { describe, it, expect } from 'vitest'
import type { ParsedSyncedEvent } from '../integrations/ical/index.js'
import { mapICalToBinOccurrences } from '../integrations/bin-sources/ical-bin-source.js'
import { getBinProvider, registerBuiltInBinProviders } from '../integrations/bin-sources/index.js'

/** A horizon spanning all of 2026, so the fixtures' dates fall inside it. */
const horizon = { start: new Date('2026-01-01'), end: new Date('2026-12-31') }

function event(title: string, isoDay: string): ParsedSyncedEvent {
  return {
    externalId: `${title}-${isoDay}`,
    title,
    description: null,
    // Councils publish all-day collections; node-ical yields a local-midnight Date.
    startTime: new Date(`${isoDay}T00:00:00`),
    endTime: null,
    allDay: true,
  }
}

describe('mapICalToBinOccurrences', () => {
  it('maps each event to a UTC-midnight collection date, sorted', () => {
    const out = mapICalToBinOccurrences(
      [event('Burgundy bin', '2026-06-30'), event('Burgundy bin', '2026-06-16')],
      {},
      horizon,
    )
    expect(out.map((o) => o.date.toISOString())).toEqual([
      '2026-06-16T00:00:00.000Z',
      '2026-06-30T00:00:00.000Z',
    ])
  })

  it('keeps only events whose title matches matchKey (case-insensitive)', () => {
    const events = [
      event('Burgundy bin (food & garden)', '2026-06-16'),
      event('Blue bin (paper & card)', '2026-06-16'),
      event('Burgundy bin (food & garden)', '2026-06-30'),
    ]
    const out = mapICalToBinOccurrences(events, { matchKey: 'burgundy' }, horizon)
    expect(out.map((o) => o.date.toISOString())).toEqual([
      '2026-06-16T00:00:00.000Z',
      '2026-06-30T00:00:00.000Z',
    ])
  })

  it('de-duplicates a day the feed repeats', () => {
    const out = mapICalToBinOccurrences(
      [event('Burgundy bin', '2026-06-16'), event('Burgundy bin', '2026-06-16')],
      { matchKey: 'burgundy' },
      horizon,
    )
    expect(out).toHaveLength(1)
  })

  it('drops dates outside the sync horizon', () => {
    const out = mapICalToBinOccurrences(
      [event('Burgundy bin', '2025-06-16'), event('Burgundy bin', '2026-06-16')],
      {},
      { start: new Date('2026-01-01'), end: new Date('2026-12-31') },
    )
    expect(out.map((o) => o.date.toISOString())).toEqual(['2026-06-16T00:00:00.000Z'])
  })

  it('passes everything through when no matchKey is set', () => {
    const out = mapICalToBinOccurrences(
      [event('Burgundy bin', '2026-06-16'), event('Blue bin', '2026-06-23')],
      {},
      horizon,
    )
    expect(out).toHaveLength(2)
  })
})

describe('registerBuiltInBinProviders', () => {
  it('wires the iCal, scraper and Home Assistant providers into the registry', () => {
    registerBuiltInBinProviders()
    expect(getBinProvider('ICAL')?.type).toBe('ICAL')
    expect(getBinProvider('SCRAPER')?.type).toBe('SCRAPER')
    expect(getBinProvider('HOME_ASSISTANT')?.type).toBe('HOME_ASSISTANT')
    expect(getBinProvider('MANUAL')).toBeNull()
  })
})
