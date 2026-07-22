import type { AlertRecipientsResponse, SendAlertResult } from '@hame/shared'
import { PERSON_ROLES } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { getHouseholdSettings } from './household-settings.service.js'
import { getConnectionSettings } from './home-assistant-config.service.js'
import {
  criticalAlertData,
  sendHaNotification,
} from '../integrations/home-assistant/notifications.js'

/**
 * Household critical-alert "poke" (spec §10 Phase 12). A member sends a short,
 * urgent message to another member's phone as a critical push via Home Assistant.
 * Reuses the Phase 8 notify path (`sendHaNotification` + `criticalAlertData`) — HA
 * owns the push, so Hame keeps no push infra and nothing is persisted.
 *
 * Gated on the household toggle (`householdAlertsEnabled`, admin Settings) both in
 * the picker and on the send path, so turning it off disables the feature outright.
 */

const isPerson = (role: string): boolean => (PERSON_ROLES as readonly string[]).includes(role)

interface Caller {
  id: string
  role: string
}

/**
 * The recipient picker for the top-bar alert modal. Returns every *other* real
 * member (never the caller, never the tablet), each flagged with whether their
 * phone is set up (`canReceive`). Empty `recipients` — plus the `enabled` /
 * `haConfigured` flags — let the client hide the icon when the feature can't run.
 */
export async function listAlertRecipients(caller: Caller): Promise<AlertRecipientsResponse> {
  const { householdAlertsEnabled } = await getHouseholdSettings()
  const haConfigured = !!(await getConnectionSettings())

  // Off at the household level, or the tablet asking — no recipients, icon hidden.
  if (!householdAlertsEnabled || !isPerson(caller.role)) {
    return { enabled: householdAlertsEnabled, haConfigured, recipients: [] }
  }

  const members = await prisma.user.findMany({
    where: { role: { in: [...PERSON_ROLES] }, id: { not: caller.id } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      firstName: true,
      colour: true,
      notificationPrefs: { select: { haNotifyService: true } },
    },
  })

  return {
    enabled: true,
    haConfigured,
    recipients: members.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      colour: m.colour,
      canReceive: !!m.notificationPrefs?.haNotifyService,
    })),
  }
}

/**
 * Send one critical alert from `sender` to a member. Always critical (bypasses
 * silent/DND) and deliberately independent of the recipient's reminder prefs — the
 * only requirement is that they've picked a phone. Returns `delivered:false` (not an
 * error) when the recipient has no phone or HA rejects the push, so the UI can say so.
 */
export async function sendAlert(
  sender: Caller,
  recipientId: string,
  message: string,
): Promise<SendAlertResult> {
  const { householdAlertsEnabled } = await getHouseholdSettings()
  if (!householdAlertsEnabled) {
    throw HttpError.forbidden('Household alerts are turned off.')
  }
  if (!isPerson(sender.role)) {
    throw HttpError.forbidden('Only household members can send alerts.')
  }
  if (recipientId === sender.id) {
    throw HttpError.badRequest('You cannot alert yourself.')
  }

  const [recipient, senderRow, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: recipientId },
      select: { role: true, notificationPrefs: { select: { haNotifyService: true } } },
    }),
    prisma.user.findUnique({ where: { id: sender.id }, select: { firstName: true } }),
    getConnectionSettings(),
  ])

  if (!recipient || !isPerson(recipient.role)) {
    throw HttpError.notFound('That household member no longer exists.')
  }
  if (!settings) {
    throw HttpError.badGateway('Home Assistant is not connected, so alerts cannot be sent.')
  }

  const service = recipient.notificationPrefs?.haNotifyService
  if (!service) return { delivered: false }

  const delivered = await sendHaNotification(settings.url, settings.token, service, {
    title: `Alert from ${senderRow?.firstName ?? 'someone'}`,
    message,
    data: criticalAlertData(),
  })
  return { delivered }
}
