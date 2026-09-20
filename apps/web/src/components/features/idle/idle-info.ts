/**
 * Pure selectors for the two idle info screens (spec §8.14) — which bin(s) are
 * due, and which planned meal matches the current time-of-day slot. Kept free of
 * React so the windowing logic is unit-tested in isolation, like the screensaver
 * state machine alongside it.
 */

import { format } from 'date-fns'
import type { BinCollection, MealPlanEntry, MealType } from '@hame/shared'
import { minutesSinceMidnight } from './sleep-window'

/** A bin with a resolved next collection date (the only kind the screen shows). */
export type ScheduledBin = BinCollection & { nextCollection: string | Date }

export interface DueBins {
  /** Whether the soonest due day is today or tomorrow. */
  when: 'today' | 'tomorrow'
  bins: ScheduledBin[]
}

/** Local calendar-day key — `nextCollection` is a local-midnight date. */
function dayKey(date: Date | string): string {
  return format(new Date(date), 'yyyy-MM-dd')
}

/**
 * The meal slot for a given hour (spec §8.14): breakfast 06:00–10:00, lunch
 * 10:00–14:00, dinner 14:00–20:00, nothing outside those (half-open windows, so
 * the boundaries fall to the later slot). Snacks have no window.
 */
export function mealTypeForHour(hour: number): MealType | null {
  if (hour >= 6 && hour < 10) return 'BREAKFAST'
  if (hour >= 10 && hour < 14) return 'LUNCH'
  if (hour >= 14 && hour < 20) return 'DINNER'
  return null
}

/**
 * The bin(s) due today or, failing that, tomorrow — so a Thursday collection
 * shows on Wednesday and Thursday only. Leads with today's when both exist. All
 * bins collected on the chosen day are returned together. Null when none are due.
 *
 * `cutoffMinutes` (minutes since local midnight) lets a household stop the
 * "due today" reminder once the bins are actually out — e.g. a 6am collection
 * makes the all-day reminder stale noise from 6am onward. Once `now` reaches
 * the cutoff, today's bins stop counting as due and the check falls through to
 * tomorrow, exactly as it already does when nothing's due today. `null`/`undefined`
 * preserves the original all-day behaviour.
 */
export function selectDueBins(
  bins: BinCollection[],
  now: Date,
  cutoffMinutes?: number | null,
): DueBins | null {
  const scheduled = bins.filter((b): b is ScheduledBin => Boolean(b.isActive && b.nextCollection))
  const todayKey = dayKey(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowKey = dayKey(tomorrow)

  const pastCutoff = cutoffMinutes != null && minutesSinceMidnight(now) >= cutoffMinutes
  if (!pastCutoff) {
    const dueToday = scheduled.filter((b) => dayKey(b.nextCollection) === todayKey)
    if (dueToday.length > 0) return { when: 'today', bins: dueToday }
  }

  const dueTomorrow = scheduled.filter((b) => dayKey(b.nextCollection) === tomorrowKey)
  if (dueTomorrow.length > 0) return { when: 'tomorrow', bins: dueTomorrow }

  return null
}

/**
 * The meal planned for the current time-of-day slot, or null when it's outside a
 * meal window or nothing is planned for that slot. Picks the first matching entry
 * if a household somehow planned two of the same meal type.
 */
export function selectSlotMeal(entries: MealPlanEntry[], now: Date): MealPlanEntry | null {
  const slot = mealTypeForHour(now.getHours())
  if (!slot) return null
  return entries.find((entry) => entry.mealType === slot) ?? null
}
