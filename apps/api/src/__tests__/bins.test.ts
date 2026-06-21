import { describe, it, expect } from 'vitest'
import type { BinScheduleRule } from '@hame/shared'
import { binOccurrencesInRange, nextBinCollection } from '@hame/shared'

/** Local-midnight date, avoiding UTC parsing surprises (June = month 5). */
const day = (y: number, m: number, d: number) => new Date(y, m, d)
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('binOccurrencesInRange', () => {
  it('WEEKLY returns every matching weekday in the window', () => {
    const rule: BinScheduleRule = { recurrenceType: 'WEEKLY', weekdays: ['TUESDAY'] }
    const dates = binOccurrencesInRange(rule, day(2026, 5, 1), day(2026, 5, 30)).map(iso)
    expect(dates).toEqual(['2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23', '2026-06-30'])
  })

  it('INTERVAL steps fortnightly from the startDate anchor, keeping phase', () => {
    const rule: BinScheduleRule = {
      recurrenceType: 'INTERVAL',
      intervalDays: 14,
      startDate: day(2026, 5, 2),
    }
    // Window starts after the anchor: first occurrence is the next on-cycle date.
    const dates = binOccurrencesInRange(rule, day(2026, 5, 10), day(2026, 5, 30)).map(iso)
    expect(dates).toEqual(['2026-06-16', '2026-06-30'])
  })

  it('DATE_OF_MONTH spans months and clamps short months (31 → 28 Feb)', () => {
    const rule: BinScheduleRule = { recurrenceType: 'DATE_OF_MONTH', dayOfMonth: 31 }
    const dates = binOccurrencesInRange(rule, day(2026, 0, 1), day(2026, 2, 31)).map(iso)
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('returns nothing when the schedule is incomplete', () => {
    expect(
      binOccurrencesInRange({ recurrenceType: 'INTERVAL' }, day(2026, 5, 1), day(2026, 5, 30)),
    ).toEqual([])
    expect(
      binOccurrencesInRange(
        { recurrenceType: 'WEEKLY', weekdays: [] },
        day(2026, 5, 1),
        day(2026, 5, 30),
      ),
    ).toEqual([])
  })
})

describe('nextBinCollection', () => {
  it('INTERVAL returns the next on-cycle date on or after `from`', () => {
    const rule: BinScheduleRule = {
      recurrenceType: 'INTERVAL',
      intervalDays: 14,
      startDate: day(2026, 5, 2),
    }
    expect(iso(nextBinCollection(rule, day(2026, 5, 10))!)).toBe('2026-06-16')
    expect(iso(nextBinCollection(rule, day(2026, 5, 2))!)).toBe('2026-06-02') // anchor itself
  })

  it('WEEKLY counts the day itself, then the next matching weekday', () => {
    const rule: BinScheduleRule = { recurrenceType: 'WEEKLY', weekdays: ['TUESDAY'] }
    expect(iso(nextBinCollection(rule, day(2026, 5, 2))!)).toBe('2026-06-02') // a Tuesday
    expect(iso(nextBinCollection(rule, day(2026, 5, 3))!)).toBe('2026-06-09') // Wed → next Tue
  })

  it('DATE_OF_MONTH rolls into next month once the day has passed', () => {
    const rule: BinScheduleRule = { recurrenceType: 'DATE_OF_MONTH', dayOfMonth: 15 }
    expect(iso(nextBinCollection(rule, day(2026, 5, 15))!)).toBe('2026-06-15') // inclusive
    expect(iso(nextBinCollection(rule, day(2026, 5, 20))!)).toBe('2026-07-15')
  })

  it('returns null when the schedule is missing its anchor', () => {
    expect(nextBinCollection({ recurrenceType: 'INTERVAL', intervalDays: 14 })).toBeNull()
  })
})
