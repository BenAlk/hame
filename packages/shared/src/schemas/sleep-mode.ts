import { z } from 'zod'

/**
 * Scheduled overnight black-screen mode for the wall tablet (spec §8.14a,
 * §10 Phase 26) — replaces relying on a separate kiosk app to blank the
 * screen. A singleton, household-wide, mirroring idle mode's settings. Once
 * idle mode goes idle, a device inside the window shows a plain black screen
 * instead of the photo/clock screensaver; any touch wakes it exactly as idle
 * mode already does. Times are minutes-since-midnight in the tablet's local
 * time, not server UTC — this drives a visible screen state a person sets
 * their own clock by, unlike the backup schedule.
 */

/** Read/update shape (member read so the wall tablet can apply it; admin write). */
export const SleepModeSettingsSchema = z.object({
  enabled: z.boolean(),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(0).max(1439),
  updatedAt: z.coerce.date(),
})
export type SleepModeSettings = z.infer<typeof SleepModeSettingsSchema>

/** Admin write shape — every field optional, so a card can patch one toggle. */
export const UpdateSleepModeSettingsSchema = SleepModeSettingsSchema.omit({
  updatedAt: true,
}).partial()
export type UpdateSleepModeSettingsInput = z.infer<typeof UpdateSleepModeSettingsSchema>
