/**
 * Scheduled reminder push (spec §8.13, §10 Phase 8). Runs in-process via node-cron
 * (single-instance caveat, spec §4); fires hourly by default but `runNotifications`
 * acts only at the morning/evening slot hours, so each reminder goes out once a day
 * (stateless — no "already sent" store). Skipped under NODE_ENV=test. Unlike the
 * sync jobs it does **not** kick a run at boot — a restart shouldn't re-push the
 * day's reminders.
 */
import cron, { type ScheduledTask } from 'node-cron'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'
import { runNotifications } from '../services/notification.service.js'

let task: ScheduledTask | null = null

export function startNotificationJob(): ScheduledTask | null {
  if (env.NODE_ENV === 'test') return null
  if (!cron.validate(env.NOTIFICATION_CRON)) {
    logger.warn(
      { cron: env.NOTIFICATION_CRON },
      'Invalid NOTIFICATION_CRON; notifications disabled',
    )
    return null
  }

  task = cron.schedule(env.NOTIFICATION_CRON, () => {
    void runNotifications().catch((err) => logger.error({ err }, 'Notification run failed'))
  })
  logger.info({ cron: env.NOTIFICATION_CRON }, '🔔 Notification reminders scheduled')
  return task
}

export function stopNotificationJob(): void {
  void task?.stop()
  task = null
}
