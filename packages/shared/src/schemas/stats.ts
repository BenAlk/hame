import { z } from 'zod'
import { MemberSummarySchema } from './user.js'

/**
 * Chore "pulling your weight" stats (spec §8.7, §9.4, §10 Phase 8). Derived live
 * from `ChoreInstance` completion history — no stored stats, no new model (§9.4).
 * The read shape only; there is nothing to write.
 */

/** Selectable look-back windows for the counts/share/on-time figures, in days. */
export const STATS_WINDOWS = [7, 30, 90] as const
export type StatsWindow = (typeof STATS_WINDOWS)[number]

/** Query param `?days=` — coerced and constrained to a known window (default 30). */
export const StatsWindowSchema = z.coerce
  .number()
  .refine((n): n is StatsWindow => (STATS_WINDOWS as readonly number[]).includes(n), {
    message: `days must be one of ${STATS_WINDOWS.join(', ')}`,
  })
  .default(30)

/** One household member's chore stats over the window. */
export const UserChoreStatsSchema = z.object({
  user: MemberSummarySchema,
  /** Chores completed by this user within the window. */
  completed: z.number().int().nonnegative(),
  /** Percentage (0–100) of the household's windowed completions this user did. */
  sharePct: z.number().min(0).max(100),
  /** Percentage (0–100) of this user's completions done on or before the due day,
   *  or null when they completed nothing in the window. */
  onTimePct: z.number().min(0).max(100).nullable(),
  /** Consecutive days (ending today/yesterday) with at least one completion. */
  currentStreak: z.number().int().nonnegative(),
})
export type UserChoreStats = z.infer<typeof UserChoreStatsSchema>

/** The full stats payload — per-user rows sorted most-completed first. */
export const ChoreStatsSchema = z.object({
  windowDays: z.number().int().positive(),
  totalCompleted: z.number().int().nonnegative(),
  perUser: z.array(UserChoreStatsSchema),
})
export type ChoreStats = z.infer<typeof ChoreStatsSchema>
