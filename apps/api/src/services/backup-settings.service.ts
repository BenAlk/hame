import {
  nextScheduledSlot,
  type BackupSettings,
  type BackupSchedule,
  type UpdateBackupSettingsInput,
} from '@hame/shared'
import type {
  BackupFrequency,
  BackupRunStatus,
  BackupSettings as BackupSettingsRow,
} from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { encryptSecret } from '../lib/crypto.js'
import { HttpError } from '../lib/http-error.js'

/**
 * Automated backup settings (spec §8.15, §10 Phase 8.9). Mirrors the config
 * singleton pattern (Immich/WiFi): the seal passphrase is AES-256-GCM encrypted
 * at rest and **never returned** — the read shape carries only `hasPassphrase`.
 */

const SINGLETON_ID = 'singleton'

/** The bare scheduling fields the pure helpers consume. */
export function toSchedule(row: BackupSettingsRow): BackupSchedule {
  return {
    enabled: row.enabled,
    frequency: row.frequency,
    hour: row.hour,
    weekday: row.weekday,
  }
}

/** Project a stored row to the client read shape (passphrase never leaves). */
function toSettings(row: BackupSettingsRow): BackupSettings {
  return {
    enabled: row.enabled,
    frequency: row.frequency,
    hour: row.hour,
    weekday: row.weekday,
    retentionCount: row.retentionCount,
    hasPassphrase: Boolean(row.passphrase),
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    nextRunAt: row.enabled ? nextScheduledSlot(toSchedule(row), new Date()).toISOString() : null,
  }
}

/** Fetch the backup settings, creating the default (disabled) row on first access. */
export async function getBackupSettingsRow(): Promise<BackupSettingsRow> {
  return prisma.backupSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
}

export async function getBackupSettings(): Promise<BackupSettings> {
  return toSettings(await getBackupSettingsRow())
}

/**
 * Update the backup settings. The passphrase is encrypted at rest; omitting it
 * keeps the stored one ("leave blank to keep"). Enabling the schedule requires a
 * stored-or-supplied passphrase — a scheduled run can't prompt for one.
 */
export async function updateBackupSettings(
  input: UpdateBackupSettingsInput,
): Promise<BackupSettings> {
  const current = await getBackupSettingsRow()
  const willHavePassphrase = Boolean(input.passphrase) || Boolean(current.passphrase)
  if (input.enabled && !willHavePassphrase) {
    throw HttpError.badRequest('Set a backup passphrase before enabling automated backups')
  }

  const data = {
    enabled: input.enabled,
    frequency: input.frequency as BackupFrequency,
    hour: input.hour,
    weekday: input.weekday,
    retentionCount: input.retentionCount,
    // Only overwrite the stored passphrase when a new one is supplied.
    ...(input.passphrase ? { passphrase: encryptSecret(input.passphrase) } : {}),
  }

  const row = await prisma.backupSettings.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  })
  return toSettings(row)
}

/** Record the outcome of a run (called by the backup service after each attempt). */
export async function recordBackupRun(
  status: BackupRunStatus,
  error: string | null,
): Promise<void> {
  await prisma.backupSettings.update({
    where: { id: SINGLETON_ID },
    data: { lastRunAt: new Date(), lastStatus: status, lastError: error },
  })
}
