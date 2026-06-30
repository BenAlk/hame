import type { BinCollection } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { listBins } from './bin.service.js'
import { listChoreInstances } from './chore.service.js'
import { listExpiringSoon, listLowStock } from './pantry.service.js'
import { listCustomEvents } from './custom-event.service.js'
import { getConnectionSettings } from './home-assistant-config.service.js'
import {
  criticalAlertData,
  sendHaNotification,
} from '../integrations/home-assistant/notifications.js'
import {
  buildReminders,
  slotForHour,
  type ReminderContext,
  type ReminderSlot,
} from '../integrations/notifications/reminder-engine.js'

/**
 * The scheduled notification run (spec §8.13, §10 Phase 8). Fired hourly by the
 * cron; acts only at the morning/evening slot hours. It builds one shared snapshot
 * of the day, then for each user with push enabled and a phone target chosen, asks
 * the pure engine what to send and pushes it through Home Assistant. Stateless —
 * no notification rows, no "already sent" tracking; each slot fires once per day by
 * virtue of the hour, so a reminder goes out exactly once (spec §7 models no feed).
 *
 * Degrades gracefully throughout: no HA configured → nothing sent; a failed push
 * is logged and the run continues (`sendHaNotification` never throws).
 */
export async function runNotifications(now: Date = new Date()): Promise<void> {
  const slot = slotForHour(now.getHours())
  if (!slot) return

  // Push is HA-only; with no connection configured there's nowhere to send.
  const settings = await getConnectionSettings()
  if (!settings) return

  const ctx = await buildContext(now, slot)

  const users = await prisma.user.findMany({ include: { notificationPrefs: true } })
  for (const user of users) {
    const prefs = user.notificationPrefs
    // Skip anyone who hasn't enabled push or picked a phone target.
    if (!prefs || !prefs.pushViaHA || !prefs.haNotifyService) continue

    const reminders = buildReminders(ctx, prefs, user.id, slot)
    if (reminders.length === 0) continue

    const data = prefs.criticalAlerts ? criticalAlertData() : undefined
    for (const reminder of reminders) {
      await sendHaNotification(settings.url, settings.token, prefs.haNotifyService, {
        title: reminder.title,
        message: reminder.lines.join('\n'),
        data,
      })
    }
  }
  logger.info({ slot, recipients: users.length }, 'Notification run complete')
}

/** Gather the day's snapshot for the slot — only what that slot needs. */
async function buildContext(now: Date, slot: ReminderSlot): Promise<ReminderContext> {
  if (slot === 'evening') {
    const bins = await listBins({ active: true })
    return {
      binsOutToday: [],
      binsOutTomorrow: binsInWindow(bins, dayWindow(now, 1), 'night'),
      choresDueToday: [],
      expiringSoon: [],
      lowStock: [],
      eventsToday: [],
    }
  }

  const today = dayWindow(now, 0)
  const [bins, instances, expiring, low, events] = await Promise.all([
    listBins({ active: true }),
    listChoreInstances({ due: 'today' }),
    listExpiringSoon(),
    listLowStock(),
    listCustomEvents({ from: today.start, to: today.end }),
  ])

  return {
    binsOutToday: binsInWindow(bins, today, 'morning'),
    binsOutTomorrow: [],
    choresDueToday: instances.map((i) => ({
      title: i.chore.title,
      assignedToId: i.assignedTo.id,
      isPetCare: i.chore.petId !== null,
    })),
    expiringSoon: unique(expiring.map((e) => e.item.name)),
    lowStock: unique(low.map((s) => s.item.name)),
    eventsToday: events.map((e) => e.title),
  }
}

/** Names of bins whose next collection falls in `window` and have this reminder on. */
function binsInWindow(
  bins: BinCollection[],
  window: { start: Date; end: Date },
  kind: 'morning' | 'night',
): string[] {
  return bins
    .filter((b) => {
      if (!b.nextCollection) return false
      if (kind === 'morning' && !b.remindMorningOf) return false
      if (kind === 'night' && !b.remindNightBefore) return false
      const date = new Date(b.nextCollection)
      return date >= window.start && date <= window.end
    })
    .map((b) => b.name)
}

/** A local-time day window `offsetDays` from `now` (0 = today, 1 = tomorrow). */
function dayWindow(now: Date, offsetDays: number): { start: Date; end: Date } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + offsetDays)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
