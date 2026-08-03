import type { NotificationPreference, UpdateNotificationPreferenceInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'

/**
 * Per-user notification preferences (spec §8.13, §10 Phase 8). A row is created
 * lazily on first read with every category on — so a household that never opens
 * the settings still gets reminders (push only kicks in once they also pick a
 * phone target). Mirrors the lazy-singleton pattern of the config services, but
 * keyed per user rather than a fixed id.
 */

interface PrefRow {
  binReminders: boolean
  choreReminders: boolean
  expiryWarnings: boolean
  lowStockAlerts: boolean
  petCareReminders: boolean
  customEventReminders: boolean
  pushViaHA: boolean
  haNotifyService: string | null
  criticalAlerts: boolean
  directNoteAlerts: boolean
  alertBreakThrough: boolean
}

function toPreference(row: PrefRow): NotificationPreference {
  return {
    binReminders: row.binReminders,
    choreReminders: row.choreReminders,
    expiryWarnings: row.expiryWarnings,
    lowStockAlerts: row.lowStockAlerts,
    petCareReminders: row.petCareReminders,
    customEventReminders: row.customEventReminders,
    pushViaHA: row.pushViaHA,
    haNotifyService: row.haNotifyService,
    criticalAlerts: row.criticalAlerts,
    directNoteAlerts: row.directNoteAlerts,
    alertBreakThrough: row.alertBreakThrough,
  }
}

/** Fetch a user's preferences, creating the all-on default row on first access. */
export async function getNotificationPreference(userId: string): Promise<NotificationPreference> {
  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })
  return toPreference(row)
}

/** Apply a partial update; omitted fields keep their stored value. */
export async function updateNotificationPreference(
  userId: string,
  input: UpdateNotificationPreferenceInput,
): Promise<NotificationPreference> {
  // An empty-string target means "clear it" (no phone chosen); undefined leaves
  // it untouched. Normalise to null so the column holds no empty strings.
  const haNotifyService =
    input.haNotifyService === undefined
      ? undefined
      : input.haNotifyService === null || input.haNotifyService === ''
        ? null
        : input.haNotifyService

  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    update: {
      ...(input.binReminders !== undefined && { binReminders: input.binReminders }),
      ...(input.choreReminders !== undefined && { choreReminders: input.choreReminders }),
      ...(input.expiryWarnings !== undefined && { expiryWarnings: input.expiryWarnings }),
      ...(input.lowStockAlerts !== undefined && { lowStockAlerts: input.lowStockAlerts }),
      ...(input.petCareReminders !== undefined && { petCareReminders: input.petCareReminders }),
      ...(input.customEventReminders !== undefined && {
        customEventReminders: input.customEventReminders,
      }),
      ...(input.pushViaHA !== undefined && { pushViaHA: input.pushViaHA }),
      ...(haNotifyService !== undefined && { haNotifyService }),
      ...(input.criticalAlerts !== undefined && { criticalAlerts: input.criticalAlerts }),
      ...(input.directNoteAlerts !== undefined && { directNoteAlerts: input.directNoteAlerts }),
      ...(input.alertBreakThrough !== undefined && {
        alertBreakThrough: input.alertBreakThrough,
      }),
    },
    create: {
      userId,
      ...input,
      haNotifyService: haNotifyService ?? null,
    },
  })
  return toPreference(row)
}
