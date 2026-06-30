import type { HaNotifyTarget } from '@hame/shared'
import { logger } from '../../lib/logger.js'

/**
 * Home Assistant push notifications (spec §8.13, §10 Phase 8). Hame sends a
 * household member's scheduled reminders to *their* phone via HA's mobile-app
 * notify service — HA owns the actual push, so Hame keeps no push infra. Both
 * sides are REST (one-shot, like the `test-connection` probe and `calendars`
 * read): discovery lists the `notify.*` services so a user can pick their phone;
 * the send POSTs to that service. The persistent WebSocket carries live entity
 * state and device controls; a fire-and-forget push doesn't need it, and REST
 * works even while the socket is mid-reconnect.
 *
 * The pure `mapNotifyTargets` is split out and unit-tested without the network,
 * the same shape as the HA entity / calendar / bin-sensor helpers.
 */

const REQUEST_TIMEOUT_MS = 10_000

/** HA's default group service — not a phone, so it's hidden from the picker. */
const EXCLUDED_NOTIFY_SERVICES = new Set(['persistent_notification'])

interface HaServiceDomain {
  domain?: unknown
  services?: unknown
}

/**
 * Project HA's `GET /api/services` payload to the notify targets a user can pick.
 * HA returns an array of `{ domain, services: { <name>: {...} } }`; we take the
 * `notify` domain's service keys (each `notify.<key>` is a target), drop the
 * default group, and humanise the key for the dropdown label.
 */
export function mapNotifyTargets(payload: unknown): HaNotifyTarget[] {
  if (!Array.isArray(payload)) return []
  const notify = (payload as HaServiceDomain[]).find((d) => d.domain === 'notify')
  if (!notify || !notify.services || typeof notify.services !== 'object') return []

  return Object.keys(notify.services as Record<string, unknown>)
    .filter((service) => !EXCLUDED_NOTIFY_SERVICES.has(service))
    .map((service) => ({ service, name: humanise(service) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** "mobile_app_bens_phone" → "Mobile app bens phone" — a readable dropdown label. */
function humanise(service: string): string {
  const spaced = service.replace(/_/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * List the household's HA notify services (Settings/Profile picker). Throws on an
 * unreachable HA so the caller can surface a 502; returns [] only when there are
 * genuinely no notify services.
 */
export async function fetchNotifyTargets(url: string, token: string): Promise<HaNotifyTarget[]> {
  const base = url.replace(/\/+$/, '')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/api/services`, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Home Assistant responded ${res.status}`)
    return mapNotifyTargets(await res.json())
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Send one push to a member's phone via `notify.<service>`. Never throws — a down
 * HA or a rejected request becomes `false` and is logged, so a failed push never
 * breaks the cron run (the same graceful-degrade contract as the syncs).
 */
export async function sendHaNotification(
  url: string,
  token: string,
  service: string,
  payload: { title: string; message: string; data?: Record<string, unknown> },
): Promise<boolean> {
  const base = url.replace(/\/+$/, '')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/api/services/notify/${encodeURIComponent(service)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        message: payload.message,
        ...(payload.data && { data: payload.data }),
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      logger.warn({ service, status: res.status }, 'Home Assistant notification rejected')
      return false
    }
    return true
  } catch (err) {
    logger.warn({ err, service }, 'Could not send Home Assistant notification')
    return false
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Build the `data` payload for a critical / high-priority push (spec §10 Phase 8).
 * Sends both platforms' keys — iOS reads `push.sound.critical` (bypasses the ring
 * switch and DND), Android reads `priority`/`ttl` (immediate, high-priority) — and
 * each side ignores the other's. Used only when a user opts into critical alerts.
 */
export function criticalAlertData(): Record<string, unknown> {
  return {
    push: { sound: { name: 'default', critical: 1, volume: 1.0 } },
    ttl: 0,
    priority: 'high',
  }
}
