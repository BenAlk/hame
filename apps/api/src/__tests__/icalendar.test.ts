import { describe, it, expect } from 'vitest'
import { buildEventICal, parseEventICal } from '../lib/icalendar.js'

describe('buildEventICal', () => {
  it('emits a valid timed VEVENT in UTC', () => {
    const ics = buildEventICal({
      uid: 'abc@hame',
      title: 'Date night',
      startTime: new Date('2026-06-27T19:00:00Z'),
      endTime: new Date('2026-06-27T22:00:00Z'),
      allDay: false,
    })
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('UID:abc@hame')
    expect(ics).toContain('DTSTART:20260627T190000Z')
    expect(ics).toContain('DTEND:20260627T220000Z')
    expect(ics).toContain('SUMMARY:Date night')
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('emits an all-day VEVENT with VALUE=DATE and an exclusive end', () => {
    const ics = buildEventICal({
      uid: 'hol@hame',
      title: 'Holiday',
      startTime: new Date('2026-07-01T00:00:00Z'),
      endTime: null,
      allDay: true,
    })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260701')
    expect(ics).toContain('DTEND;VALUE=DATE:20260702') // exclusive next day
  })

  it('escapes TEXT special characters', () => {
    const ics = buildEventICal({
      uid: 'x@hame',
      title: 'Lunch; then, shopping',
      description: 'line1\nline2',
      startTime: new Date('2026-06-27T12:00:00Z'),
      allDay: false,
    })
    expect(ics).toContain('SUMMARY:Lunch\\; then\\, shopping')
    expect(ics).toContain('DESCRIPTION:line1\\nline2')
  })
})

describe('parseEventICal', () => {
  it('round-trips a generated event back to the same fields', () => {
    const fields = {
      uid: 'rt@hame',
      title: 'Standup',
      description: 'daily',
      startTime: new Date('2026-06-22T09:00:00Z'),
      endTime: new Date('2026-06-22T09:15:00Z'),
      allDay: false,
    }
    const parsed = parseEventICal(buildEventICal(fields))
    expect(parsed).toMatchObject({
      uid: 'rt@hame',
      title: 'Standup',
      description: 'daily',
      allDay: false,
    })
    expect(parsed?.startTime.toISOString()).toBe('2026-06-22T09:00:00.000Z')
    expect(parsed?.endTime?.toISOString()).toBe('2026-06-22T09:15:00.000Z')
  })

  it('round-trips an all-day event as all-day', () => {
    const parsed = parseEventICal(
      buildEventICal({
        uid: 'ad@hame',
        title: 'Holiday',
        startTime: new Date('2026-07-01T00:00:00Z'),
        endTime: null,
        allDay: true,
      }),
    )
    expect(parsed).toMatchObject({ title: 'Holiday', allDay: true })
  })

  it('parses a phone-authored VEVENT (folded lines, CRLF)', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Samsung//Calendar//EN',
      'BEGIN:VEVENT',
      'UID:phone-123',
      'SUMMARY:Dentist',
      'DTSTART:20260624T090000Z',
      'DTEND:20260624T093000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    expect(parseEventICal(ics)).toMatchObject({ uid: 'phone-123', title: 'Dentist', allDay: false })
  })

  it('returns null for a document with no event', () => {
    expect(parseEventICal('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n')).toBeNull()
    expect(parseEventICal('not ical at all')).toBeNull()
  })
})
