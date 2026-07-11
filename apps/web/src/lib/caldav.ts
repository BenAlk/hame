import type { CalDavConnection } from '@hame/shared'

/**
 * The base URL a CalDAV client (DAVx5) should connect to. Preference:
 *   1. the configured public/domain URL (`CALDAV_PUBLIC_URL`), for real deployments;
 *   2. the server's detected LAN address + this page's port, for local testing
 *      (so a phone gets a reachable IP instead of `localhost`);
 *   3. the browser origin, as a last resort.
 */
/**
 * The CalDAV collection URL clients connect to — the base origin plus `/caldav/`.
 * Handing DAVx5 (and other clients) the collection directly avoids relying on
 * `.well-known` discovery, which DAVx5's URL-login flow doesn't reliably follow.
 */
export function caldavCollectionUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/caldav/`
}

export function caldavUrl(conn: CalDavConnection | undefined): string {
  if (conn?.publicUrl) return conn.publicUrl
  const onLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  if (onLocalhost && conn?.lanAddress) {
    const port = window.location.port ? `:${window.location.port}` : ''
    return `${window.location.protocol}//${conn.lanAddress}${port}`
  }
  return window.location.origin
}

/**
 * A `davx5://` deep link a phone can scan (QR) to open DAVx5 with the server URL
 * and username pre-filled. The password is deliberately left out — DAVx5's manual
 * warns against encoding it in the URL, and the member enters their one-time app
 * password by hand.
 *
 * The path points straight at Hame's CalDAV collection (`/caldav/`), not the site
 * root: `/` serves the SPA (a PROPFIND there 404s), so handing DAVx5 the root makes
 * its discovery fail. `/caldav/` returns the `current-user-principal` directly, so
 * DAVx5 finds the calendars without depending on `.well-known` redirect handling.
 * `davx5://` rewrites to https; plain-http (LAN) bases use `caldav://` (→ http).
 * Returns null if the base URL can't be parsed.
 */
export function davx5SetupUrl(baseUrl: string, username: string): string | null {
  try {
    const url = new URL(baseUrl)
    const scheme = url.protocol === 'https:' ? 'davx5' : 'caldav'
    return `${scheme}://${encodeURIComponent(username)}@${url.host}/caldav/`
  } catch {
    return null
  }
}
