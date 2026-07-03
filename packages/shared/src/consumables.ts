/**
 * "Probably due" heuristic for consumables (spec §8.3, §12).
 *
 * A consumable is due for re-order when it has a cadence (`reorderIntervalDays`)
 * and at least that many days have passed since it was last bought. A consumable
 * that has never been bought stays neutral — we have no baseline to measure
 * from, and nagging about something never purchased would be noise. Purely
 * derived from data captured in Phase 8.4, so it needs no extra tracking.
 */

const MS_PER_DAY = 86_400_000

interface DueInput {
  reorderIntervalDays: number | null
  lastBoughtAt: Date | string | null
}

/** Whole days elapsed since a consumable was last bought, or `null` if never. */
export function daysSinceLastBought(
  lastBoughtAt: Date | string | null,
  now: Date = new Date(),
): number | null {
  if (lastBoughtAt == null) return null
  const last = new Date(lastBoughtAt).getTime()
  if (Number.isNaN(last)) return null
  return Math.floor((now.getTime() - last) / MS_PER_DAY)
}

/** True when a consumable is likely due for re-order (see module doc). */
export function isConsumableDue(c: DueInput, now: Date = new Date()): boolean {
  if (c.reorderIntervalDays == null) return false
  const days = daysSinceLastBought(c.lastBoughtAt, now)
  return days !== null && days >= c.reorderIntervalDays
}
