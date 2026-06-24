import type { HomeAssistantTestResult } from '@hame/shared'

/**
 * One-shot REST probe of a Home Assistant server (spec §8.11), used by the
 * Settings "Test connection" button against a possibly-unsaved URL + token —
 * the analogue of the Ollama integration's `fetchOllamaModels`. Validates auth
 * via `GET /api/` (200 = token good) and reads the version from `GET /api/config`,
 * without standing up the persistent WebSocket. Never throws: a network failure
 * or bad token becomes a structured `{ ok: false }` result.
 */

const PROBE_TIMEOUT_MS = 10_000

export async function testHomeAssistantConnection(
  url: string,
  token: string,
): Promise<HomeAssistantTestResult> {
  const base = url.replace(/\/+$/, '')
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/api/`, { headers, signal: controller.signal })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Connected, but the access token was rejected.' }
    }
    if (!res.ok) {
      return { ok: false, message: `Home Assistant responded ${res.status}.` }
    }
    return {
      ok: true,
      message: 'Connected to Home Assistant.',
      version: await fetchVersion(base, headers),
    }
  } catch {
    return { ok: false, message: 'Could not reach Home Assistant at that URL.' }
  } finally {
    clearTimeout(timeout)
  }
}

/** Best-effort version read; absence shouldn't fail an otherwise-good probe. */
async function fetchVersion(
  base: string,
  headers: Record<string, string>,
): Promise<string | undefined> {
  try {
    const res = await fetch(`${base}/api/config`, { headers })
    if (!res.ok) return undefined
    const body = (await res.json()) as { version?: unknown }
    return typeof body.version === 'string' ? body.version : undefined
  } catch {
    return undefined
  }
}
