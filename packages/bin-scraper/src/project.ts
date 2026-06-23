/**
 * Project concrete collection dates from a single schedule observation.
 *
 * Councils publish only "this week" + a weekday/frequency, so from one reading:
 *   • a bin **out this week** is anchored exactly (this week's matching weekday);
 *   • a **fortnightly** bin not out this week is the alternate week — also exact;
 *   • a **4-weekly** bin not out this week has an ambiguous phase (could be +1/+2/
 *     +3 weeks). It is anchored only when a `priorAnchor` is supplied (a known
 *     past collection date carried over from an earlier reading) — otherwise it
 *     can't be placed yet and projection returns nothing for it.
 *
 * Callers re-read on a schedule and feed the latest known date back as the
 * `priorAnchor`, so a 4-weekly bin pins within one cycle and then self-corrects.
 */
import type { BinSchedule, CollectionObservation } from './types.js'
import { addDays, dateOfWeekdayInWeek, isoWeekdayOf, toUtcDateOnly } from './dates.js'

export interface ProjectOptions {
  /** Inclusive window start (defaults to the observation's week start). */
  from?: Date
  /** Inclusive window end — required, bounds the projection. */
  to: Date
  /**
   * A known past/recent collection date for this bin from an earlier reading.
   * Resolves a 4-weekly bin's phase when it isn't out in the observed week.
   */
  priorAnchor?: Date
}

/** Whether a remembered `anchor` falls on the same date as the bin's weekday this week. */
function predictsObservedWeek(anchor: Date, thisWeek: Date, frequencyDays: number): boolean {
  const diffDays = Math.round((thisWeek.getTime() - anchor.getTime()) / 86_400_000)
  return diffDays % frequencyDays === 0
}

/**
 * The earliest concrete collection date for one bin (a real date in its cycle),
 * or null if its phase can't be determined from this observation.
 */
function resolveAnchor(
  bin: BinSchedule,
  observation: CollectionObservation,
  priorAnchor?: Date,
): Date | null {
  const thisWeek = dateOfWeekdayInWeek(observation.weekStart, bin.weekday)

  if (bin.outThisWeek) return thisWeek
  // Weekly: collected every week on its weekday, whether or not the snippet
  // happens to list it — its phase is unambiguous.
  if (bin.frequencyDays <= 7) return thisWeek
  // Fortnightly has only two phases: not-this-week ⇒ the alternate (next) week.
  if (bin.frequencyDays === 14) return addDays(thisWeek, 7)
  // Otherwise (4-weekly): trust a remembered real collection date, but reject a
  // stale one — if it would put a collection in the observed week the page says
  // is empty for this bin, the council has shifted phase since, so re-pin later.
  if (priorAnchor) {
    const anchor = toUtcDateOnly(priorAnchor)
    const sameWeekday = isoWeekdayOf(anchor) === bin.weekday
    if (sameWeekday && !predictsObservedWeek(anchor, thisWeek, bin.frequencyDays)) return anchor
  }
  return null
}

/** Project one bin's collection dates within `[from, to]`. */
export function projectBinDates(
  bin: BinSchedule,
  observation: CollectionObservation,
  options: ProjectOptions,
): Date[] {
  const anchor = resolveAnchor(bin, observation, options.priorAnchor)
  if (!anchor) return []

  const from = toUtcDateOnly(options.from ?? observation.weekStart)
  const to = toUtcDateOnly(options.to)
  const step = bin.frequencyDays

  // Wind back to the first occurrence on/after `from`, then step forward to `to`.
  let cursor = anchor
  if (cursor < from) {
    const gaps = Math.ceil((from.getTime() - cursor.getTime()) / (step * 86_400_000))
    cursor = addDays(cursor, gaps * step)
  } else if (cursor > from) {
    const gaps = Math.floor((cursor.getTime() - from.getTime()) / (step * 86_400_000))
    cursor = addDays(cursor, -gaps * step)
  }

  const dates: Date[] = []
  for (; cursor <= to; cursor = addDays(cursor, step)) {
    if (cursor >= from) dates.push(cursor)
  }
  return dates
}
