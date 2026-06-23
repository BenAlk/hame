import { describe, it, expect } from 'vitest'
import type { BinSchedule, CollectionObservation } from '../types.js'
import { projectBinDates } from '../project.js'

// Observed week: Mon 22 Jun – Fri 26 Jun 2026. Collection weekday: Tuesday (2).
const observation: CollectionObservation = {
  area: 'Hamilton',
  weekStart: new Date('2026-06-22T00:00:00.000Z'),
  weekEnd: new Date('2026-06-26T00:00:00.000Z'),
  bins: [],
}
const to = new Date('2026-08-01T00:00:00.000Z')

function bin(over: Partial<BinSchedule>): BinSchedule {
  return { name: 'Test', key: 'test', weekday: 2, frequencyDays: 14, outThisWeek: false, ...over }
}

function days(dates: Date[]): string[] {
  return dates.map((d) => d.toISOString().slice(0, 10))
}

describe('projectBinDates', () => {
  it('anchors a bin out this week to this week and projects forward', () => {
    const out = projectBinDates(bin({ outThisWeek: true, frequencyDays: 14 }), observation, { to })
    // Tue 23 Jun, then every fortnight.
    expect(days(out)).toEqual(['2026-06-23', '2026-07-07', '2026-07-21'])
  })

  it('anchors a weekly bin every week even when the snippet omits it', () => {
    const out = projectBinDates(bin({ outThisWeek: false, frequencyDays: 7 }), observation, {
      to: new Date('2026-07-15T00:00:00.000Z'),
    })
    expect(days(out)).toEqual(['2026-06-23', '2026-06-30', '2026-07-07', '2026-07-14'])
  })

  it('places a fortnightly bin not out this week on the alternate week', () => {
    const out = projectBinDates(bin({ outThisWeek: false, frequencyDays: 14 }), observation, { to })
    expect(days(out)).toEqual(['2026-06-30', '2026-07-14', '2026-07-28'])
  })

  it('anchors a 4-weekly bin out this week and steps by 28 days', () => {
    const out = projectBinDates(bin({ outThisWeek: true, frequencyDays: 28 }), observation, { to })
    expect(days(out)).toEqual(['2026-06-23', '2026-07-21'])
  })

  it('cannot place a 4-weekly bin not out this week without a prior anchor', () => {
    const out = projectBinDates(bin({ outThisWeek: false, frequencyDays: 28 }), observation, { to })
    expect(out).toEqual([])
  })

  it('uses a prior anchor to resolve a 4-weekly bin not out this week', () => {
    // A known past Tuesday collection; its cycle is 12 May → 9 Jun → 7 Jul → 4 Aug,
    // none of which fall in the observed week (22–26 Jun), consistent with the page.
    const out = projectBinDates(bin({ outThisWeek: false, frequencyDays: 28 }), observation, {
      to,
      priorAnchor: new Date('2026-05-12T00:00:00.000Z'),
    })
    expect(days(out)).toEqual(['2026-07-07'])
  })

  it('rejects a stale prior anchor that predicts a collection in the empty observed week', () => {
    // 26 May → 23 Jun lands in the observed week, but the page says this bin is
    // not out this week — the schedule has shifted, so don't trust the old phase.
    const out = projectBinDates(bin({ outThisWeek: false, frequencyDays: 28 }), observation, {
      to,
      priorAnchor: new Date('2026-05-26T00:00:00.000Z'),
    })
    expect(out).toEqual([])
  })

  it('rejects a prior anchor on the wrong weekday', () => {
    const out = projectBinDates(bin({ outThisWeek: false, frequencyDays: 28 }), observation, {
      to,
      priorAnchor: new Date('2026-05-13T00:00:00.000Z'), // a Wednesday
    })
    expect(out).toEqual([])
  })

  it('honours an explicit from-window', () => {
    const out = projectBinDates(bin({ outThisWeek: true, frequencyDays: 14 }), observation, {
      from: new Date('2026-07-08T00:00:00.000Z'),
      to,
    })
    expect(days(out)).toEqual(['2026-07-21'])
  })
})
