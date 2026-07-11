import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BackupSettings as BackupSettingsRow, Prisma } from '@prisma/client'
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_JOIN_TABLES,
  BACKUP_MODELS,
  BACKUP_SECRET_FIELDS,
  BackupPayloadSchema,
  isBackupDue,
  type BackupEnvelope,
  type BackupPayload,
  type ImportBackupResult,
  type RunBackupResult,
} from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'
import { openBackup, sealBackup } from '../lib/backup-crypto.js'
import { env } from '../lib/env.js'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'
import { reloadHomeAssistant } from '../integrations/home-assistant/index.js'
import { getBackupSettingsRow, recordBackupRun, toSchedule } from './backup-settings.service.js'

/**
 * Backup export/import (spec §8.15, §9.8). The row dump uses Postgres' own
 * `json_agg` / `json_populate_recordset` so every column type — arrays, JSON,
 * enums, dates, nulls — round-trips faithfully and timestamps are preserved
 * exactly, with the model order from `@hame/shared` governing FK-safe inserts.
 *
 * All table names interpolated into SQL come from the fixed `BACKUP_MODELS` /
 * `BACKUP_JOIN_TABLES` constants (never user input), so the raw-unsafe queries
 * carry no injection surface.
 */

// A client that can run raw SQL — satisfied by both `prisma` and a tx client.
type RawClient = Pick<Prisma.TransactionClient, '$queryRawUnsafe' | '$executeRawUnsafe'>

/** The latest applied migration, or null on a brand-new database. */
async function currentMigration(client: RawClient): Promise<string | null> {
  const rows = await client.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
       ORDER BY finished_at DESC LIMIT 1`,
  )
  return rows[0]?.migration_name ?? null
}

/** Read one table as an array of plain row objects via `json_agg`. */
async function dumpTable(client: RawClient, table: string): Promise<Record<string, unknown>[]> {
  const result = await client.$queryRawUnsafe<Array<{ rows: Record<string, unknown>[] }>>(
    `SELECT COALESCE(json_agg(t), '[]'::json) AS rows FROM "${table}" t`,
  )
  return result[0]?.rows ?? []
}

/** Insert rows back into a table via `json_populate_recordset` (a no-op when empty). */
async function loadTable(
  client: RawClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return
  await client.$executeRawUnsafe(
    `INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`,
    JSON.stringify(rows),
  )
}

/**
 * Export the whole database as a passphrase-encrypted backup envelope. Secrets
 * encrypted at rest are decrypted into the payload so the file isn't chained to
 * this instance's `ENCRYPTION_KEY`; the passphrase is what protects the file.
 */
export async function exportBackup(passphrase: string): Promise<BackupEnvelope> {
  const payload = await prisma.$transaction(async (tx) => {
    const migration = await currentMigration(tx)
    if (!migration) throw HttpError.badRequest('Database has no applied migrations to back up')

    const tables: Record<string, Record<string, unknown>[]> = {}
    const counts: Record<string, number> = {}
    for (const model of BACKUP_MODELS) {
      const rows = await dumpTable(tx, model)
      const secretFields = BACKUP_SECRET_FIELDS[model]
      if (secretFields) {
        for (const row of rows) {
          for (const field of secretFields) {
            const value = row[field]
            if (typeof value === 'string' && value.length > 0) row[field] = decryptSecret(value)
          }
        }
      }
      tables[model] = rows
      counts[model] = rows.length
    }

    const joinTables: Record<string, { A: string; B: string }[]> = {}
    for (const table of BACKUP_JOIN_TABLES) {
      joinTables[table] = (await dumpTable(tx, table)) as { A: string; B: string }[]
    }

    return {
      manifest: {
        formatVersion: BACKUP_FORMAT_VERSION,
        app: 'hame' as const,
        migration,
        createdAt: new Date().toISOString(),
        counts,
      },
      tables,
      joinTables,
    } satisfies BackupPayload
  })

  return sealBackup(JSON.stringify(payload), passphrase)
}

/**
 * Restore a backup, replacing all current data. Refuses a file taken at a
 * different schema version, then wipes and reloads in one transaction so a
 * failure leaves the instance untouched. Secrets are re-encrypted under this
 * instance's key, and live integrations (Home Assistant) are reconnected.
 */
export async function importBackup(
  passphrase: string,
  envelope: BackupEnvelope,
): Promise<ImportBackupResult> {
  const plaintext = await openBackup(envelope, passphrase) // throws 400 on wrong passphrase

  let payload: BackupPayload
  try {
    payload = BackupPayloadSchema.parse(JSON.parse(plaintext))
  } catch {
    throw HttpError.badRequest('This file is not a valid Hame backup')
  }

  if (payload.manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw HttpError.badRequest('This backup was made by an incompatible version of Hame')
  }

  // Version gate — restore only into a matching schema (spec §8.15).
  const current = await currentMigration(prisma)
  if (payload.manifest.migration !== current) {
    throw HttpError.badRequest(
      `This backup was taken at a different app version (${payload.manifest.migration}). ` +
        `Restore it into an instance running the same version of Hame.`,
    )
  }

  // Integrity check — the data must match the manifest's counts before we wipe.
  for (const model of BACKUP_MODELS) {
    const actual = payload.tables[model]?.length ?? 0
    const expected = payload.manifest.counts[model] ?? 0
    if (actual !== expected) {
      throw HttpError.badRequest('Backup file failed its integrity check and was not restored')
    }
  }

  const restored = await prisma.$transaction(
    async (tx) => {
      // Wipe every model + join table in one shot; CASCADE + our full list means
      // FK order is irrelevant. `_prisma_migrations` is untouched (nothing FKs it).
      const allTables = [...BACKUP_MODELS, ...BACKUP_JOIN_TABLES].map((t) => `"${t}"`).join(', ')
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${allTables} RESTART IDENTITY CASCADE`)

      const counts: Record<string, number> = {}
      for (const model of BACKUP_MODELS) {
        const rows = payload.tables[model] ?? []
        const secretFields = BACKUP_SECRET_FIELDS[model]
        if (secretFields) {
          for (const row of rows) {
            for (const field of secretFields) {
              const value = row[field]
              if (typeof value === 'string' && value.length > 0) row[field] = encryptSecret(value)
            }
          }
        }
        await loadTable(tx, model, rows)
        counts[model] = rows.length
      }

      for (const table of BACKUP_JOIN_TABLES) {
        await loadTable(tx, table, payload.joinTables[table] ?? [])
      }

      return counts
    },
    { timeout: 120_000, maxWait: 15_000 },
  )

  // Reconnect integrations that cache config in memory (the HA socket). Config
  // singletons are read from the DB per request, so nothing else needs a nudge.
  await reloadHomeAssistant()

  const totalRows = Object.values(restored).reduce((sum, n) => sum + n, 0)
  logger.info({ totalRows }, 'Backup restored')
  return { restored, totalRows }
}

// ── Automated on-disk backups (spec §10 Phase 8.9) ───────────────────────────

/**
 * Scheduled backups reuse {@link exportBackup} — the identical passphrase-encrypted
 * envelope — but write it to the host-mounted `BACKUP_DIR` with rolling retention,
 * so a household survives a dead container or database without touching the shell.
 * The schedule and seal passphrase live on the `BackupSettings` singleton; a coarse
 * hourly tick reads them and the pure `isBackupDue` decides (catching up a slot
 * missed while the container was down).
 */

/** Filename prefix marking a file as an automated backup (so pruning is scoped). */
const AUTO_PREFIX = 'hame-auto-'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** A sortable, colon-free filename — ISO timestamps sort lexicographically. */
function backupFilename(now = new Date()): string {
  return `${AUTO_PREFIX}${now.toISOString().replace(/[:.]/g, '-')}.json`
}

/**
 * Delete automated backups beyond the newest `retentionCount`. Filenames carry an
 * ISO timestamp, so a descending lexicographic sort is newest-first. Returns how
 * many files remain. A missing directory is treated as empty (no error).
 */
export async function pruneBackups(dir: string, retentionCount: number): Promise<number> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return 0
  }
  const files = entries
    .filter((f) => f.startsWith(AUTO_PREFIX) && f.endsWith('.json'))
    .sort()
    .reverse()
  const remove = files.slice(retentionCount)
  await Promise.all(remove.map((f) => unlink(join(dir, f)).catch(() => undefined)))
  return files.length - remove.length
}

/** Seal a fresh backup to `BACKUP_DIR` and prune, using the stored passphrase. */
async function writeScheduledBackup(row: BackupSettingsRow): Promise<RunBackupResult> {
  const passphrase = row.passphrase ? decryptSecret(row.passphrase) : null
  if (!passphrase) throw HttpError.badRequest('Set a backup passphrase before running a backup')

  const envelope = await exportBackup(passphrase)
  const dir = env.BACKUP_DIR
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const filename = backupFilename()
  // 0o600 — the file carries password hashes and decrypted secrets (sealed, but
  // keep it owner-only on disk regardless).
  await writeFile(join(dir, filename), JSON.stringify(envelope), { mode: 0o600 })
  const retained = await pruneBackups(dir, row.retentionCount)
  return { filename, retained }
}

/**
 * Run a backup immediately (the admin "Back up now" button), recording the
 * outcome. Rethrows so the caller sees the error; the outcome is still recorded.
 */
export async function runBackupNow(): Promise<RunBackupResult> {
  const row = await getBackupSettingsRow()
  try {
    const result = await writeScheduledBackup(row)
    await recordBackupRun('SUCCESS', null)
    logger.info({ filename: result.filename, retained: result.retained }, 'Manual backup written')
    return result
  } catch (err) {
    await recordBackupRun('FAILURE', errorMessage(err))
    throw err
  }
}

/**
 * The scheduled tick (hourly): back up only if due, and never throw — a failure
 * is recorded and logged so the cron loop stays alive (graceful-degrade, §9.6).
 */
export async function runBackupTick(now = new Date()): Promise<void> {
  const row = await getBackupSettingsRow()
  if (!isBackupDue(toSchedule(row), row.lastRunAt, now)) return
  try {
    const result = await writeScheduledBackup(row)
    await recordBackupRun('SUCCESS', null)
    logger.info(
      { filename: result.filename, retained: result.retained },
      'Scheduled backup written',
    )
  } catch (err) {
    await recordBackupRun('FAILURE', errorMessage(err))
    logger.error({ err }, 'Scheduled backup failed')
  }
}
