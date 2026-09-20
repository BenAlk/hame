/**
 * Scheduled refresh of external calendar feeds (spec §8.10). Runs in-process via
 * node-cron, so the API must run single-instance or jobs double-fire (spec §4).
 * Skipped under NODE_ENV=test.
 */
import cron, { type ScheduledTask } from 'node-cron'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'
import { syncAllActiveSources } from '../services/calendar-source.service.js'
import { rollRecurringCalendarEvents } from '../services/custom-event.service.js'

let task: ScheduledTask | null = null

/** External sources plus the repeating-event CalDAV roll-forward (both calendar upkeep). */
async function runCalendarSync(): Promise<void> {
  await Promise.all([
    syncAllActiveSources().catch((err) => logger.error({ err }, 'Calendar sync run failed')),
    rollRecurringCalendarEvents().catch((err) =>
      logger.error({ err }, 'Recurring calendar event roll-forward failed'),
    ),
  ])
}

/** Start the periodic calendar sync. Returns a stop handle for graceful shutdown. */
export function startCalendarSyncJob(): ScheduledTask | null {
  if (env.NODE_ENV === 'test') return null
  if (!cron.validate(env.CALENDAR_SYNC_CRON)) {
    logger.warn(
      { cron: env.CALENDAR_SYNC_CRON },
      'Invalid CALENDAR_SYNC_CRON; calendar sync disabled',
    )
    return null
  }

  task = cron.schedule(env.CALENDAR_SYNC_CRON, () => void runCalendarSync())
  logger.info({ cron: env.CALENDAR_SYNC_CRON }, '📆 Calendar sync scheduled')

  // Kick one run shortly after boot so feeds populate without waiting a full interval.
  setTimeout(() => void runCalendarSync(), 10_000).unref()
  return task
}

export function stopCalendarSyncJob(): void {
  void task?.stop()
  task = null
}
