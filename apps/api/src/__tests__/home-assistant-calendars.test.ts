import { describe, it, expect } from 'vitest'
import { mapHaCalendarEvents } from '../integrations/home-assistant/calendars.js'

describe('mapHaCalendarEvents', () => {
  it('maps a timed event to a cache-ready row', () => {
    const rows = mapHaCalendarEvents(
      [
        {
          start: { dateTime: '2026-06-24T10:00:00+01:00' },
          end: { dateTime: '2026-06-24T11:00:00+01:00' },
          summary: 'Dentist',
          description: 'Checkup',
          uid: 'abc',
        },
      ],
      'calendar.personal',
    )
    expect(rows).toEqual([
      {
        externalId: 'abc-2026-06-24T09:00:00.000Z',
        title: 'Dentist',
        description: 'Checkup',
        startTime: new Date('2026-06-24T10:00:00+01:00'),
        endTime: new Date('2026-06-24T11:00:00+01:00'),
        allDay: false,
      },
    ])
  })

  it('flags an all-day event and parses its date at UTC midnight', () => {
    const [row] = mapHaCalendarEvents(
      [{ start: { date: '2026-06-24' }, end: { date: '2026-06-25' }, summary: 'Holiday' }],
      'calendar.personal',
    )
    expect(row.allDay).toBe(true)
    expect(row.startTime.toISOString()).toBe('2026-06-24T00:00:00.000Z')
  })

  it('synthesises an external id when the event has no uid', () => {
    const [row] = mapHaCalendarEvents(
      [{ start: { dateTime: '2026-06-24T10:00:00Z' }, summary: 'X' }],
      'calendar.work',
    )
    expect(row.externalId).toBe('calendar.work:2026-06-24T10:00:00.000Z-2026-06-24T10:00:00.000Z')
    expect(row.endTime).toBeNull()
  })

  it('de-duplicates a uid+start repeated by HA and sorts by start', () => {
    const rows = mapHaCalendarEvents(
      [
        { start: { dateTime: '2026-06-25T09:00:00Z' }, summary: 'Later', uid: 'b' },
        { start: { dateTime: '2026-06-24T09:00:00Z' }, summary: 'Earlier', uid: 'a' },
        { start: { dateTime: '2026-06-24T09:00:00Z' }, summary: 'Earlier dup', uid: 'a' },
      ],
      'calendar.personal',
    )
    expect(rows.map((r) => r.title)).toEqual(['Earlier', 'Later'])
  })

  it('ignores malformed input and entries without a start', () => {
    expect(mapHaCalendarEvents(null, 'calendar.x')).toEqual([])
    expect(mapHaCalendarEvents([{ summary: 'no start' }], 'calendar.x')).toEqual([])
  })
})
