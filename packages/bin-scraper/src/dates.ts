/** Date helpers — all collection dates are date-only at UTC midnight. */
import type { IsoWeekday } from './types.js'

const MS_PER_DAY = 86_400_000

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** A UTC-midnight date-only value. */
export function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

/** Strip a Date to UTC-midnight of its UTC calendar day. */
export function toUtcDateOnly(d: Date): Date {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY)
}

/** ISO weekday of a UTC date (1 = Monday … 7 = Sunday). */
export function isoWeekdayOf(d: Date): IsoWeekday {
  const js = d.getUTCDay() // 0 = Sunday
  return (js === 0 ? 7 : js) as IsoWeekday
}

/** Parse a weekday name ("Tuesday") to its ISO number, or null. */
export function parseWeekday(name: string): IsoWeekday | null {
  const i = WEEKDAYS.indexOf(name.trim().toLowerCase())
  return i === -1 ? null : ((i + 1) as IsoWeekday)
}

/** Parse a long date like "22 June 2026" to a UTC-midnight date, or null. */
export function parseLongDate(text: string): Date | null {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text)
  if (!m) return null
  const day = Number(m[1])
  const month = MONTHS.indexOf(m[2].toLowerCase())
  const year = Number(m[3])
  if (month === -1) return null
  return utcDate(year, month, day)
}

/**
 * Parse a frequency phrase to a day interval: "Weekly" → 7, "Fortnightly" → 14,
 * "4 Weekly" / "Every 4 weeks" → 28, "N Weekly" → N×7. Returns null if unknown.
 */
export function parseFrequencyDays(text: string): number | null {
  const t = text.toLowerCase()
  if (t.includes('fortnight')) return 14
  const everyN = /(\d+)\s*week/.exec(t)
  if (everyN) return Number(everyN[1]) * 7
  if (t.includes('week')) return 7
  return null
}

/** The date of a given ISO weekday within the (Monday-anchored) week of `weekStart`. */
export function dateOfWeekdayInWeek(weekStart: Date, weekday: IsoWeekday): Date {
  const startIso = isoWeekdayOf(weekStart) // normally 1 (Monday)
  return addDays(weekStart, weekday - startIso)
}
