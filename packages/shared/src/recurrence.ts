/**
 * Recurrence engine for chores (spec §8.7, §9.4).
 *
 * A `Chore` is a template; each occurrence is a `ChoreInstance` with a due date.
 * These pure date helpers compute when the next occurrence falls — no Prisma, so
 * they're unit-testable and the frontend can preview "next due" too.
 *
 * Two entry points:
 *   - {@link firstDueDate} — the opening instance when a chore is created.
 *   - {@link nextDueDate}  — the following instance once one is completed.
 *
 * All dates are treated as calendar days (time component stripped) to match the
 * `@db.Date` columns the due dates are stored in.
 */
import type { RecurrenceType, Weekday } from './constants/index.js'

export interface RecurrenceRule {
  recurrenceType: RecurrenceType
  intervalDays?: number | null
  weekdays?: Weekday[] | null
  dayOfMonth?: number | null
  oneOffDate?: Date | null
}

/** Weekday name → JS `Date.getDay()` index (Sunday = 0). */
const JS_DAY: Record<Weekday, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
}

/** Midnight of `d`, as a new Date (never mutates the input). */
function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** `d` shifted by `n` whole days, normalised to midnight. */
function addDays(d: Date, n: number): Date {
  const x = startOfDay(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Number of days in the given month (`month` is 0-based and may overflow). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * The first date matching one of `weekdays`, scanning forward from `from`.
 * `inclusive` decides whether `from` itself counts. Returns null if no weekdays.
 */
function weekdayOccurrence(from: Date, weekdays: Weekday[] | null | undefined, inclusive: boolean) {
  if (!weekdays || weekdays.length === 0) return null
  const targets = new Set(weekdays.map((w) => JS_DAY[w]))
  let candidate = startOfDay(from)
  // At most 8 steps: covers a full week even when the first day is skipped.
  for (let i = 0; i < 8; i++) {
    if ((inclusive || i > 0) && targets.has(candidate.getDay())) return candidate
    candidate = addDays(candidate, 1)
  }
  /* c8 ignore next */
  return null
}

/**
 * The `dayOfMonth` occurrence at or after (`inclusive`) / strictly after `from`,
 * clamped to the month's length so 31 lands on 28/29 Feb, 30 Apr, etc. (spec §8.7).
 */
function monthlyOccurrence(from: Date, dayOfMonth: number | null | undefined, inclusive: boolean) {
  if (!dayOfMonth) return null
  const ref = startOfDay(from)
  // This month, then next — next month's clamped day always clears `ref`.
  for (let i = 0; i < 2; i++) {
    const year = ref.getFullYear()
    const month = ref.getMonth() + i
    const day = Math.min(dayOfMonth, daysInMonth(year, month))
    const candidate = startOfDay(new Date(year, month, day))
    if (inclusive ? candidate >= ref : candidate > ref) return candidate
  }
  /* c8 ignore next */
  return null
}

/**
 * Due date for a chore's first instance — the first occurrence on or after `from`
 * (default today). INTERVAL chores are due immediately; ONE_OFF uses its date as
 * given (even if already past, so it shows as overdue). Returns null only when the
 * rule is missing the field it needs (e.g. ONE_OFF without a date).
 */
export function firstDueDate(rule: RecurrenceRule, from: Date = new Date()): Date | null {
  switch (rule.recurrenceType) {
    case 'INTERVAL':
      return startOfDay(from)
    case 'WEEKLY':
      return weekdayOccurrence(from, rule.weekdays, true)
    case 'DATE_OF_MONTH':
      return monthlyOccurrence(from, rule.dayOfMonth, true)
    case 'ONE_OFF':
      return rule.oneOffDate ? startOfDay(rule.oneOffDate) : null
  }
}

/**
 * Due date for the instance that follows a completed one. INTERVAL counts forward
 * from the completion date ("every X days from last completion"); WEEKLY and
 * DATE_OF_MONTH advance from the scheduled due date so a late completion doesn't
 * drift the schedule. ONE_OFF never recurs → null.
 */
export function nextDueDate(
  rule: RecurrenceRule,
  prev: { dueDate: Date; completedAt: Date },
): Date | null {
  switch (rule.recurrenceType) {
    case 'INTERVAL':
      return rule.intervalDays ? addDays(prev.completedAt, rule.intervalDays) : null
    case 'WEEKLY':
      return weekdayOccurrence(prev.dueDate, rule.weekdays, false)
    case 'DATE_OF_MONTH':
      return monthlyOccurrence(prev.dueDate, rule.dayOfMonth, false)
    case 'ONE_OFF':
      return null
  }
}
