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

/**
 * HA's mobile-app integration registers one `notify.mobile_app_<device>` service
 * per phone/tablet running the Companion app — that prefix is the reliable "this
 * is a personal push device" signal. We filter to it so the picker shows only
 * phones, not the other things that also live under the `notify` domain (Alexa
 * media players, notify groups, `persistent_notification`, custom notify scripts).
 */
const MOBILE_APP_PREFIX = 'mobile_app_'

interface HaServiceDomain {
  domain?: unknown
  services?: unknown
}

/**
 * Project HA's `GET /api/services` payload to the phones a user can pick. HA
 * returns an array of `{ domain, services: { <name>: {...} } }`; we take the
 * `notify` domain's service keys (each `notify.<key>` is a target), keep only the
 * mobile-app devices, and humanise the key for the dropdown label.
 */
export function mapNotifyTargets(payload: unknown): HaNotifyTarget[] {
  if (!Array.isArray(payload)) return []
  const notify = (payload as HaServiceDomain[]).find((d) => d.domain === 'notify')
  if (!notify || !notify.services || typeof notify.services !== 'object') return []

  return Object.keys(notify.services as Record<string, unknown>)
    .filter((service) => service.startsWith(MOBILE_APP_PREFIX))
    .map((service) => ({ service, name: humanise(service) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** "mobile_app_bens_phone" → "Bens phone" — the device name, prefix stripped. */
function humanise(service: string): string {
  const spaced = service.slice(MOBILE_APP_PREFIX.length).replace(/_/g, ' ').trim()
  if (!spaced) return service
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** A Home Assistant device-registry entry (only the fields we read for names). */
interface HaDevice {
  name?: unknown
  name_by_user?: unknown
  identifiers?: unknown
}

/**
 * Overlay friendly device names from HA's device registry onto the notify targets.
 * A `notify.mobile_app_<slug>` service is HA's slugify of the device's registration
 * name, so we key each mobile-app device by that same slug and prefer the user's
 * rename (`name_by_user`) then the registration `name` (e.g. "Galaxy Watch5 (1RAB)"
 * instead of "Galaxy watch5 1rab"). Targets with no matching device keep their
 * slug-derived label. Pure — the (WS-only) registry fetch lives in the client.
 */
export function enrichWithDeviceNames(
  targets: HaNotifyTarget[],
  devices: unknown[],
): HaNotifyTarget[] {
  const nameBySlug = new Map<string, string>()
  for (const device of devices as HaDevice[]) {
    if (!isMobileAppDevice(device)) continue
    const registrationName = typeof device.name === 'string' ? device.name : null
    if (!registrationName) continue
    const renamed =
      typeof device.name_by_user === 'string' && device.name_by_user.trim()
        ? device.name_by_user
        : registrationName
    nameBySlug.set(slugifyDeviceName(registrationName), renamed)
  }
  if (nameBySlug.size === 0) return targets

  return targets
    .map((target) => {
      const friendly = nameBySlug.get(target.service.slice(MOBILE_APP_PREFIX.length))
      return friendly ? { ...target, name: friendly } : target
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Whether a device-registry entry is a mobile-app (Companion app) device. */
function isMobileAppDevice(device: HaDevice): boolean {
  return (
    Array.isArray(device.identifiers) &&
    device.identifiers.some((pair) => Array.isArray(pair) && pair[0] === 'mobile_app')
  )
}

/** HA's slugify for the fields we match on: lowercase, non-alphanumerics → `_`. */
export function slugifyDeviceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
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
 * Sends both platforms' keys — each side ignores the other's:
 *
 * - **iOS** reads `push.sound.critical`, which bypasses the ring switch and Do Not
 *   Disturb (needs the Critical Alerts permission granted to the HA app once).
 * - **Android** has no payload-only "critical" flag. `priority`/`ttl` only make the
 *   push immediate + heads-up; to actually *sound while the ringer is silenced* the
 *   notification must play through the alarm audio stream — that's what
 *   `channel: 'alarm_stream'` does. (Overriding Do Not Disturb too is a per-device
 *   choice Android won't let an app self-grant: each user allows the "alarm_stream"
 *   channel to override DND once in the HA app — see the companion docs.)
 *
 * `importance` is sent because Android locks a channel's importance the **first**
 * time the channel is created, and afterwards only ever honours a *lowering* of it.
 * Left unset the channel is created at "default" (audible, but not intrusive), and
 * that becomes permanent for the device — so the strongest setting has to be
 * claimed up front or it can never be claimed at all. It has no effect on a device
 * whose "alarm_stream" channel already exists; those must be reset on the handset.
 */
export function criticalAlertData(): Record<string, unknown> {
  return {
    push: { sound: { name: 'default', critical: 1, volume: 1.0 } },
    ttl: 0,
    priority: 'high',
    channel: 'alarm_stream',
    importance: 'high',
  }
}
