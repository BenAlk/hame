/**
 * Scheduled refresh of external bin sources (spec §8.9, §10 Phase 5.6). Re-fetches
 * each active external bin's schedule so its cached collection dates self-correct
 * (a bank-holiday shift just appears on the next run). Runs in-process via
 * node-cron, so the API must run single-instance or jobs double-fire (spec §4).
 * A no-op until an external provider is wired; skipped under NODE_ENV=test.
 */
import cron, { type ScheduledTask } from 'node-cron'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'
import { syncAllActiveBins } from '../services/bin.service.js'

let task: ScheduledTask | null = null

/** Start the periodic bin sync. Returns a stop handle for graceful shutdown. */
export function startBinSyncJob(): ScheduledTask | null {
  if (env.NODE_ENV === 'test') return null
  if (!cron.validate(env.BIN_SYNC_CRON)) {
    logger.warn({ cron: env.BIN_SYNC_CRON }, 'Invalid BIN_SYNC_CRON; bin sync disabled')
    return null
  }

  task = cron.schedule(env.BIN_SYNC_CRON, () => {
    void syncAllActiveBins().catch((err) => logger.error({ err }, 'Bin sync run failed'))
  })
  logger.info({ cron: env.BIN_SYNC_CRON }, '🚮 Bin sync scheduled')

  // Kick one run shortly after boot so caches populate without waiting an interval.
  setTimeout(() => void syncAllActiveBins(), 12_000).unref()
  return task
}

export function stopBinSyncJob(): void {
  void task?.stop()
  task = null
}
