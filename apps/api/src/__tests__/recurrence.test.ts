import { describe, it, expect } from 'vitest'
import type { Weekday } from '@hame/shared'
import { firstDueDate, nextDueDate } from '@hame/shared'

const WEEKDAY_NAMES: Weekday[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]
const weekdayOf = (d: Date): Weekday => WEEKDAY_NAMES[d.getDay()]
/** Local-midnight date, avoiding UTC parsing surprises. */
const day = (y: number, m: number, d: number) => new Date(y, m, d)

describe('firstDueDate', () => {
  it('INTERVAL is due immediately (today, time stripped)', () => {
    const from = new Date(2026, 5, 19, 14, 30)
    expect(firstDueDate({ recurrenceType: 'INTERVAL', intervalDays: 30 }, from)).toEqual(
      day(2026, 5, 19),
    )
  })

  it('WEEKLY returns the reference day itself when it matches (inclusive)', () => {
    const from = day(2026, 5, 19)
    const due = firstDueDate({ recurrenceType: 'WEEKLY', weekdays: [weekdayOf(from)] }, from)
    expect(due).toEqual(from)
  })

  it('WEEKLY picks the nearest upcoming weekday across several', () => {
    const from = day(2026, 5, 19)
    const near = weekdayOf(day(2026, 5, 21)) // +2 days
    const far = weekdayOf(day(2026, 5, 24)) // +5 days
    const due = firstDueDate({ recurrenceType: 'WEEKLY', weekdays: [far, near] }, from)
    expect(due).toEqual(day(2026, 5, 21))
  })

  it('DATE_OF_MONTH clamps 31 to the month length', () => {
    // From mid-January, the 31st of *this* month exists.
    expect(
      firstDueDate({ recurrenceType: 'DATE_OF_MONTH', dayOfMonth: 31 }, day(2026, 0, 15)),
    ).toEqual(day(2026, 0, 31))
  })

  it('ONE_OFF uses its date, and is null without one', () => {
    const date = day(2026, 11, 25)
    expect(firstDueDate({ recurrenceType: 'ONE_OFF', oneOffDate: date }, day(2026, 5, 1))).toEqual(
      date,
    )
    expect(
      firstDueDate({ recurrenceType: 'ONE_OFF', oneOffDate: null }, day(2026, 5, 1)),
    ).toBeNull()
  })
})

describe('nextDueDate', () => {
  it('INTERVAL counts forward from the completion date, not the due date', () => {
    const next = nextDueDate(
      { recurrenceType: 'INTERVAL', intervalDays: 30 },
      { dueDate: day(2026, 5, 1), completedAt: new Date(2026, 5, 5, 9, 0) },
    )
    expect(next).toEqual(day(2026, 6, 5)) // 5 Jun + 30 days
  })

  it('WEEKLY advances strictly past the scheduled due date', () => {
    const due = day(2026, 5, 20)
    const next = nextDueDate(
      { recurrenceType: 'WEEKLY', weekdays: [weekdayOf(due)] },
      { dueDate: due, completedAt: new Date(2026, 5, 22) },
    )
    expect(next).toEqual(day(2026, 5, 27)) // same weekday, one week on
  })

  it('DATE_OF_MONTH rolls into next month with clamping (Jan 31 → Feb 28, 2026)', () => {
    const next = nextDueDate(
      { recurrenceType: 'DATE_OF_MONTH', dayOfMonth: 31 },
      { dueDate: day(2026, 0, 31), completedAt: day(2026, 0, 31) },
    )
    expect(next).toEqual(day(2026, 1, 28))
  })

  it('DATE_OF_MONTH clamps to 29 in a leap February', () => {
    const next = nextDueDate(
      { recurrenceType: 'DATE_OF_MONTH', dayOfMonth: 31 },
      { dueDate: day(2024, 0, 31), completedAt: day(2024, 0, 31) },
    )
    expect(next).toEqual(day(2024, 1, 29))
  })

  it('ONE_OFF never recurs', () => {
    const next = nextDueDate(
      { recurrenceType: 'ONE_OFF', oneOffDate: day(2026, 5, 1) },
      { dueDate: day(2026, 5, 1), completedAt: day(2026, 5, 1) },
    )
    expect(next).toBeNull()
  })
})
