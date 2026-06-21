import { describe, it, expect } from 'vitest'
import { parseICalEvents } from '../integrations/ical/index.js'

/** Minimal valid iCal document wrapping the given VEVENT blocks. */
function ics(...vevents: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', ...vevents, 'END:VCALENDAR'].join(
    '\r\n',
  )
}

const NOW = new Date('2026-06-21T12:00:00Z')

describe('parseICalEvents', () => {
  it('parses a single timed event', () => {
    const doc = ics(
      [
        'BEGIN:VEVENT',
        'UID:evt-1@test',
        'SUMMARY:Dentist',
        'DESCRIPTION:Checkup',
        'DTSTART:20260625T090000Z',
        'DTEND:20260625T093000Z',
        'END:VEVENT',
      ].join('\r\n'),
    )
    const events = parseICalEvents(doc, NOW)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      externalId: 'evt-1@test',
      title: 'Dentist',
      description: 'Checkup',
      allDay: false,
    })
    expect(events[0].startTime.toISOString()).toBe('2026-06-25T09:00:00.000Z')
    expect(events[0].endTime?.toISOString()).toBe('2026-06-25T09:30:00.000Z')
  })

  it('flags an all-day event (DATE value)', () => {
    const doc = ics(
      [
        'BEGIN:VEVENT',
        'UID:evt-2@test',
        'SUMMARY:Holiday',
        'DTSTART;VALUE=DATE:20260701',
        'END:VEVENT',
      ].join('\r\n'),
    )
    const events = parseICalEvents(doc, NOW)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ title: 'Holiday', allDay: true })
  })

  it('expands a weekly recurring event within the horizon', () => {
    const doc = ics(
      [
        'BEGIN:VEVENT',
        'UID:evt-3@test',
        'SUMMARY:Standup',
        'DTSTART:20260622T090000Z',
        'DTEND:20260622T091500Z',
        'RRULE:FREQ=WEEKLY;COUNT=3',
        'END:VEVENT',
      ].join('\r\n'),
    )
    const events = parseICalEvents(doc, NOW).filter((e) => e.title === 'Standup')
    // COUNT=3 weekly occurrences, each a distinct externalId carrying its start.
    expect(events).toHaveLength(3)
    expect(new Set(events.map((e) => e.externalId)).size).toBe(3)
    expect(events.every((e) => e.externalId.startsWith('evt-3@test-'))).toBe(true)
  })

  it('ignores non-VEVENT components and events outside the horizon', () => {
    const doc = ics(
      [
        'BEGIN:VEVENT',
        'UID:old@test',
        'SUMMARY:Ancient',
        'DTSTART:20200101T090000Z',
        'END:VEVENT',
      ].join('\r\n'),
    )
    expect(parseICalEvents(doc, NOW)).toEqual([])
  })
})
