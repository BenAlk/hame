/**
 * Pure chore-stats helpers (spec §8.7, §9.4, §10 Phase 8) — the "pulling your
 * weight" maths, kept database-free so it's unit-testable in isolation, the same
 * split as the recurrence and reminder engines. The service feeds these raw
 * completion timestamps; they never touch Prisma or HTTP.
 *
 * All day maths is done in **local time** (the household's timezone — the same
 * assumption the bin/calendar/reminder date maths makes), reduced to a DST-free
 * integer "day ordinal" so consecutive calendar days are always adjacent
 * integers regardless of daylight-saving shifts.
 */

/** Days since the epoch for a Y/M/D triple — via `Date.UTC`, so it's DST-free. */
function ordinal(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month, day) / 86_400_000)
}

/** The local calendar day of a timestamp, as a day ordinal. */
function localDayOrdinal(date: Date): number {
  return ordinal(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * The calendar day of a `@db.Date` value, as a day ordinal. Prisma returns a
 * date-only column as UTC midnight, so its day is read in UTC (reading it in a
 * behind-UTC timezone would shift it to the previous day).
 */
function dateOnlyOrdinal(date: Date): number {
  return ordinal(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/**
 * The current completion streak: the run of consecutive days, ending today (or
 * yesterday, so it doesn't reset the instant midnight passes), on which the user
 * completed at least one chore. Returns 0 when the most recent completion is
 * older than yesterday. Order-independent — dedupes to calendar days first.
 */
export function computeStreak(completions: Date[], today: Date = new Date()): number {
  const days = new Set(completions.map(localDayOrdinal))
  let cursor = localDayOrdinal(today)

  // A streak is only "live" if there's a completion today or yesterday.
  if (!days.has(cursor)) {
    cursor -= 1
    if (!days.has(cursor)) return 0
  }

  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor -= 1
  }
  return streak
}

/**
 * Whether a chore was completed on time — on or before its due day. `completedAt`
 * is a full timestamp (read in local time); `dueDate` is a date-only value (read
 * in UTC, see above). Compared by calendar day, so completing any time on the due
 * date still counts as on time.
 */
export function isOnTime(completedAt: Date, dueDate: Date): boolean {
  return localDayOrdinal(completedAt) <= dateOnlyOrdinal(dueDate)
}
