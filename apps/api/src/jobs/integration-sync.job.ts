/**
 * Scheduled refresh of external integrations (spec §9.9, §10 Phase 10). Re-polls
 * each active integration so its cached snapshot (STATUS) or events (CALENDAR)
 * self-correct, the same shape as the bin/calendar sync jobs. Runs in-process via
 * node-cron, so the API must run single-instance or jobs double-fire (spec §4).
 * A no-op when no integrations exist; skipped under NODE_ENV=test.
 */
import cron, { type ScheduledTask } from 'node-cron'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'
import { pollAllActiveIntegrations } from '../services/integration.service.js'

let task: ScheduledTask | null = null

/** Start the periodic integration poll. Returns a stop handle for graceful shutdown. */
export function startIntegrationSyncJob(): ScheduledTask | null {
  if (env.NODE_ENV === 'test') return null
  if (!cron.validate(env.INTEGRATION_SYNC_CRON)) {
    logger.warn(
      { cron: env.INTEGRATION_SYNC_CRON },
      'Invalid INTEGRATION_SYNC_CRON; integration sync disabled',
    )
    return null
  }

  task = cron.schedule(env.INTEGRATION_SYNC_CRON, () => {
    void pollAllActiveIntegrations().catch((err) =>
      logger.error({ err }, 'Integration sync run failed'),
    )
  })
  logger.info({ cron: env.INTEGRATION_SYNC_CRON }, '🔌 Integration sync scheduled')

  // Kick one run shortly after boot so caches populate without waiting an interval.
  setTimeout(() => void pollAllActiveIntegrations(), 15_000).unref()
  return task
}

export function stopIntegrationSyncJob(): void {
  void task?.stop()
  task = null
}
