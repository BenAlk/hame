/**
 * Scheduled on-disk backups (spec §8.15, §10 Phase 8.9). A coarse hourly tick
 * reads the `BackupSettings` singleton and `runBackupTick` acts only when a backup
 * is **due** (pure `isBackupDue`), so the schedule is DB-driven and adjustable at
 * runtime without rescheduling node-cron. Runs in-process (single-instance caveat,
 * spec §4); skipped under NODE_ENV=test. A run shortly after boot catches up a slot
 * missed while the container was down.
 */
import cron, { type ScheduledTask } from 'node-cron'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'
import { runBackupTick } from '../services/backup.service.js'

// Hourly — backups are at hour granularity, and a coarse tick catches up a missed
// slot rather than relying on firing at an exact instant.
const TICK_CRON = '0 * * * *'

let task: ScheduledTask | null = null

export function startBackupJob(): ScheduledTask | null {
  if (env.NODE_ENV === 'test') return null

  task = cron.schedule(TICK_CRON, () => {
    void runBackupTick().catch((err) => logger.error({ err }, 'Backup tick failed'))
  })
  logger.info({ dir: env.BACKUP_DIR }, '💾 Automated backup tick scheduled')

  // Catch up a backup missed while the container was down, shortly after boot.
  setTimeout(
    () => void runBackupTick().catch((err) => logger.error({ err }, 'Backup tick failed')),
    20_000,
  ).unref()
  return task
}

export function stopBackupJob(): void {
  void task?.stop()
  task = null
}
