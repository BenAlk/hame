import { z } from 'zod'

/**
 * Automated on-disk backup settings (spec §8.15, §10 Phase 8.9). Extends the
 * manual backup/restore (§8.8) with a scheduled producer of the same
 * passphrase-encrypted envelopes, written to a host-mounted directory with
 * rolling retention. The schedule lives in the DB (this singleton), so a coarse
 * hourly tick reads it and a pure `isBackupDue` decides — which also catches up a
 * run missed while the container was down (the same pure/impure split as the
 * recurrence / reminder / chore-stats engines).
 */

export const BACKUP_FREQUENCIES = ['DAILY', 'WEEKLY'] as const
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number]

/** Outcome of the last scheduled run, surfaced in Settings. */
export const BACKUP_RUN_STATUSES = ['SUCCESS', 'FAILURE'] as const
export type BackupRunStatus = (typeof BACKUP_RUN_STATUSES)[number]

/** Rolling-retention bounds — at least one file kept, capped to keep disk sane. */
export const BACKUP_RETENTION_MIN = 1
export const BACKUP_RETENTION_MAX = 30
export const BACKUP_RETENTION_DEFAULT = 7

/** Minimum length for the stored automated-backup passphrase (matches export). */
export const BACKUP_PASSPHRASE_MIN = 8

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * The read shape returned to the client. The stored passphrase is **never
 * returned** (the `hasPassphrase` / `hasToken` pattern from HA/Immich); `nextRunAt`
 * is computed for display. All timestamps are ISO strings over the wire.
 */
export const BackupSettingsSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(BACKUP_FREQUENCIES),
  /** Hour-of-day (UTC / container time) the backup runs at. */
  hour: z.number().int().min(0).max(23),
  /** Day-of-week for WEEKLY (0 = Sunday … 6 = Saturday, matching `Date.getUTCDay`). */
  weekday: z.number().int().min(0).max(6),
  retentionCount: z.number().int().min(BACKUP_RETENTION_MIN).max(BACKUP_RETENTION_MAX),
  hasPassphrase: z.boolean(),
  lastRunAt: z.string().nullable(),
  lastStatus: z.enum(BACKUP_RUN_STATUSES).nullable(),
  lastError: z.string().nullable(),
  /** Next scheduled slot (ISO), or null when disabled. Display-only. */
  nextRunAt: z.string().nullable(),
})
export type BackupSettings = z.infer<typeof BackupSettingsSchema>

/**
 * The update (admin write) shape. `passphrase` is optional — omitting it keeps
 * the stored one ("leave blank to keep"). Enabling without a stored-or-supplied
 * passphrase is refused at the service layer (it needs to know current state).
 */
export const UpdateBackupSettingsSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(BACKUP_FREQUENCIES),
  hour: z.number().int().min(0).max(23),
  weekday: z.number().int().min(0).max(6),
  retentionCount: z.number().int().min(BACKUP_RETENTION_MIN).max(BACKUP_RETENTION_MAX),
  passphrase: z
    .string()
    .min(BACKUP_PASSPHRASE_MIN, `Use a passphrase of at least ${BACKUP_PASSPHRASE_MIN} characters`)
    .optional(),
})
export type UpdateBackupSettingsInput = z.infer<typeof UpdateBackupSettingsSchema>

/** What a manual "back up now" reports back. */
export const RunBackupResultSchema = z.object({
  filename: z.string(),
  /** How many backup files remain in the directory after retention pruning. */
  retained: z.number().int().nonnegative(),
})
export type RunBackupResult = z.infer<typeof RunBackupResultSchema>

/** The scheduling fields the pure helpers need — a subset of the settings. */
export interface BackupSchedule {
  enabled: boolean
  frequency: BackupFrequency
  hour: number
  weekday: number
}

/** A Date at the given UTC hour on the same UTC calendar day as `base`. */
function slotOnDay(base: Date, hour: number): Date {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour, 0, 0, 0),
  )
}

/**
 * The most recent scheduled slot at or before `now` (in UTC). For DAILY this is
 * today's `hour` if already past, else yesterday's; for WEEKLY it walks back to
 * the configured weekday. Pure and DST-free (all UTC arithmetic).
 */
export function mostRecentScheduledSlot(cfg: BackupSchedule, now: Date): Date {
  let slot = slotOnDay(now, cfg.hour)
  if (cfg.frequency === 'DAILY') {
    if (slot.getTime() > now.getTime()) slot = new Date(slot.getTime() - MS_PER_DAY)
    return slot
  }
  // WEEKLY — step back to the configured weekday, then a further week if still ahead.
  const dayDiff = (now.getUTCDay() - cfg.weekday + 7) % 7
  slot = new Date(slot.getTime() - dayDiff * MS_PER_DAY)
  if (slot.getTime() > now.getTime()) slot = new Date(slot.getTime() - 7 * MS_PER_DAY)
  return slot
}

/** The next scheduled slot strictly after `now` — display-only ("next backup"). */
export function nextScheduledSlot(cfg: BackupSchedule, now: Date): Date {
  const recent = mostRecentScheduledSlot(cfg, now)
  const step = cfg.frequency === 'DAILY' ? MS_PER_DAY : 7 * MS_PER_DAY
  return new Date(recent.getTime() + step)
}

/**
 * Whether a backup is due now: enabled, and either never run or last run before
 * the most recent scheduled slot. This is what makes the hourly tick catch up a
 * slot missed while the container was down — the moment it's back up, `lastRunAt`
 * is older than the passed slot, so the tick fires.
 */
export function isBackupDue(cfg: BackupSchedule, lastRunAt: Date | null, now: Date): boolean {
  if (!cfg.enabled) return false
  const slot = mostRecentScheduledSlot(cfg, now)
  return lastRunAt === null || lastRunAt.getTime() < slot.getTime()
}
