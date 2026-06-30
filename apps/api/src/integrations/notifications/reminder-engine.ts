/**
 * The reminder engine (spec §8.13, §10 Phase 8) — pure, so it's unit-testable
 * without a database or Home Assistant, the same split as the HA protocol/entity
 * helpers. It takes a pre-digested snapshot of the household's day plus one user's
 * preferences and returns the push(es) to send that user.
 *
 * Delivery is **stateless and time-anchored** (spec §7 models no notification
 * feed): the cron fires hourly, the job picks a `slot` from the hour, and each
 * reminder goes out once at its moment — a morning digest of the day ahead and an
 * evening "bins out tomorrow" heads-up. All date maths lives in the (impure) job
 * that builds the context; the engine only assembles text by preference + slot.
 */

export type ReminderSlot = 'morning' | 'evening'

/**
 * The hours the two slots fire (server local time — assumed to be the household's
 * timezone, the same assumption the bin/calendar date maths makes). Morning sends
 * the day-ahead digest; evening the "bins out tomorrow" heads-up.
 */
export const MORNING_HOUR = 7
export const EVENING_HOUR = 20

/** Which slot (if any) a given hour belongs to — the cron fires hourly. */
export function slotForHour(hour: number): ReminderSlot | null {
  if (hour === MORNING_HOUR) return 'morning'
  if (hour === EVENING_HOUR) return 'evening'
  return null
}

/** One chore instance due today, already classified pet-care vs ordinary. */
export interface ReminderChore {
  title: string
  /** Who it's assigned to — chore/pet-care reminders go only to the assignee. */
  assignedToId: string | null
  /** True when the chore is linked to a pet (the pet-care category). */
  isPetCare: boolean
}

/** A pre-digested snapshot of the day, shared across all users in one run. */
export interface ReminderContext {
  /** Bin names collected today (morning-of reminder opted in). */
  binsOutToday: string[]
  /** Bin names collected tomorrow (night-before reminder opted in). */
  binsOutTomorrow: string[]
  choresDueToday: ReminderChore[]
  /** Item descriptions, e.g. "Milk (today)" / "Eggs (in 2 days)". */
  expiringSoon: string[]
  /** Item names below their minimum stock. */
  lowStock: string[]
  /** Custom event titles happening today. */
  eventsToday: string[]
}

/** The category toggles that gate which lines a user receives. */
export interface ReminderPrefs {
  binReminders: boolean
  choreReminders: boolean
  expiryWarnings: boolean
  lowStockAlerts: boolean
  petCareReminders: boolean
  customEventReminders: boolean
}

/** One push: a title and the body lines (joined with newlines by the sender). */
export interface Reminder {
  title: string
  lines: string[]
}

/**
 * Build the reminders to push one user in a given slot. Returns at most one push:
 * an evening "bins out tomorrow" note, or a morning digest combining every
 * enabled category that has something to say. Empty when nothing applies — so the
 * job never sends a blank notification.
 */
export function buildReminders(
  ctx: ReminderContext,
  prefs: ReminderPrefs,
  userId: string,
  slot: ReminderSlot,
): Reminder[] {
  if (slot === 'evening') {
    if (!prefs.binReminders || ctx.binsOutTomorrow.length === 0) return []
    return [{ title: 'Bins out tomorrow', lines: [ctx.binsOutTomorrow.join(', ')] }]
  }

  // Chore + pet-care reminders are personal — only the assignee hears about them.
  const myChores = ctx.choresDueToday.filter((c) => c.assignedToId === userId && !c.isPetCare)
  const myPetCare = ctx.choresDueToday.filter((c) => c.assignedToId === userId && c.isPetCare)

  const lines: string[] = []
  if (prefs.binReminders && ctx.binsOutToday.length > 0) {
    lines.push(`Bins out today: ${ctx.binsOutToday.join(', ')}`)
  }
  if (prefs.choreReminders && myChores.length > 0) {
    lines.push(`Chores due: ${myChores.map((c) => c.title).join(', ')}`)
  }
  if (prefs.petCareReminders && myPetCare.length > 0) {
    lines.push(`Pet care: ${myPetCare.map((c) => c.title).join(', ')}`)
  }
  if (prefs.expiryWarnings && ctx.expiringSoon.length > 0) {
    lines.push(`Expiring soon: ${ctx.expiringSoon.join(', ')}`)
  }
  if (prefs.lowStockAlerts && ctx.lowStock.length > 0) {
    lines.push(`Low stock: ${ctx.lowStock.join(', ')}`)
  }
  if (prefs.customEventReminders && ctx.eventsToday.length > 0) {
    lines.push(`Today: ${ctx.eventsToday.join(', ')}`)
  }

  if (lines.length === 0) return []
  return [{ title: "Today's reminders", lines }]
}
