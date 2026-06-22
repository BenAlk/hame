import { describe, it, expect } from 'vitest'
import { CreateBinSchema } from '@hame/shared'
import {
  type BinScheduleProvider,
  getBinProvider,
  registerBinProvider,
} from '../integrations/bin-sources/index.js'

describe('bin-source provider registry', () => {
  it('returns null for MANUAL (computed, never fetched)', () => {
    expect(getBinProvider('MANUAL')).toBeNull()
  })

  it('returns null for an external type with no provider wired yet', () => {
    expect(getBinProvider('SCRAPER')).toBeNull()
  })

  it('dispatches to a registered provider', () => {
    const provider: BinScheduleProvider = {
      type: 'ICAL',
      fetchOccurrences: async () => [{ date: new Date(2026, 5, 25) }],
    }
    registerBinProvider(provider)
    expect(getBinProvider('ICAL')).toBe(provider)
  })
})

describe('CreateBinSchema source-aware refinement', () => {
  const base = { name: 'Burgundy bin', colour: '#7d2b3e' }

  it('accepts a MANUAL bin with a complete recurrence', () => {
    const r = CreateBinSchema.safeParse({
      ...base,
      sourceType: 'MANUAL',
      recurrenceType: 'WEEKLY',
      weekdays: ['TUESDAY'],
    })
    expect(r.success).toBe(true)
  })

  it('defaults sourceType to MANUAL and still demands a recurrence type', () => {
    const r = CreateBinSchema.safeParse({ ...base })
    expect(r.success).toBe(false)
  })

  it('requires a startDate anchor for a MANUAL INTERVAL bin', () => {
    const r = CreateBinSchema.safeParse({
      ...base,
      sourceType: 'MANUAL',
      recurrenceType: 'INTERVAL',
      intervalDays: 14,
    })
    expect(r.success).toBe(false)
  })

  it('requires a feed URL for an ICAL bin and ignores recurrence', () => {
    expect(
      CreateBinSchema.safeParse({ ...base, sourceType: 'ICAL', sourceConfig: {} }).success,
    ).toBe(false)
    expect(
      CreateBinSchema.safeParse({
        ...base,
        sourceType: 'ICAL',
        sourceConfig: { url: 'https://council.example/bins.ics', matchKey: 'burgundy' },
      }).success,
    ).toBe(true)
  })

  it('requires council + address for a SCRAPER bin', () => {
    expect(
      CreateBinSchema.safeParse({
        ...base,
        sourceType: 'SCRAPER',
        sourceConfig: { councilId: 'south-lanarkshire' },
      }).success,
    ).toBe(false)
    expect(
      CreateBinSchema.safeParse({
        ...base,
        sourceType: 'SCRAPER',
        sourceConfig: { councilId: 'south-lanarkshire', addressId: '12345' },
      }).success,
    ).toBe(true)
  })
})
