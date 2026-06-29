import { z } from 'zod'

/**
 * Wall-tablet idle / screensaver settings (spec §8.14, §10 Phase 7.3). A
 * singleton — household-wide, not per-user, because the wall tablet is shared
 * and no one is actively logged in during idle. After `activationMinutes` of
 * inactivity the dashboard cycles Immich photos (`photoDisplaySeconds` each) and
 * a large clock (`clockDisplaySeconds`); touch wakes it. `immichEnabled` off (or
 * no photos available) falls back to clock-only.
 */

/** Read/update shape (member read so the wall tablet can apply it; admin write). */
export const IdleModeSettingsSchema = z.object({
  enabled: z.boolean(),
  activationMinutes: z.number().int().min(1).max(120),
  photoDisplaySeconds: z.number().int().min(3).max(600),
  clockDisplaySeconds: z.number().int().min(5).max(3600),
  shufflePhotos: z.boolean(),
  showWeatherInClockMode: z.boolean(),
  immichEnabled: z.boolean(),
  updatedAt: z.coerce.date(),
})
export type IdleModeSettings = z.infer<typeof IdleModeSettingsSchema>

/** Admin write shape — every field optional, so a card can patch one toggle. */
export const UpdateIdleModeSettingsSchema = IdleModeSettingsSchema.omit({
  updatedAt: true,
}).partial()
export type UpdateIdleModeSettingsInput = z.infer<typeof UpdateIdleModeSettingsSchema>
