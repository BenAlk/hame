/**
 * Nightly QuickNotes sweep (spec §8.16, §10 Phase 11). Hard-deletes notes past
 * their expiry so the household board never accretes stale clutter; pinned/kept
 * notes have no expiry and are never touched. Runs in-process via node-cron
 * (single-instance caveat, spec §4); skipped under NODE_ENV=test. Kicks one run
 * shortly after boot so a long downtime's backlog clears without waiting a day.
 */
import cron, { type ScheduledTask } from 'node-cron'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'
import { sweepExpiredNotes } from '../services/note.service.js'

let task: ScheduledTask | null = null

export function startNoteSweepJob(): ScheduledTask | null {
  if (env.NODE_ENV === 'test') return null
  if (!cron.validate(env.NOTE_SWEEP_CRON)) {
    logger.warn({ cron: env.NOTE_SWEEP_CRON }, 'Invalid NOTE_SWEEP_CRON; note sweep disabled')
    return null
  }

  task = cron.schedule(env.NOTE_SWEEP_CRON, () => {
    void sweepExpiredNotes().catch((err) => logger.error({ err }, 'Note sweep run failed'))
  })
  logger.info({ cron: env.NOTE_SWEEP_CRON }, '🗒️ QuickNotes sweep scheduled')

  setTimeout(() => void sweepExpiredNotes(), 15_000).unref()
  return task
}

export function stopNoteSweepJob(): void {
  void task?.stop()
  task = null
}
