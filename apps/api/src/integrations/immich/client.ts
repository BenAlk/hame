import type { ImmichAlbum, ImmichTestResult } from '@hame/shared'
import { extractAlbums, extractImageAssetIds } from './assets.js'

/**
 * Dependency-free Immich REST client (spec §8.14, §10 Phase 7.3) — native
 * `fetch` + the `x-api-key` header, mirroring the HA REST probe. Only three
 * endpoints are touched, kept in one place so they're easy to adjust against a
 * live server:
 *   - `GET /api/albums`          — list albums (Settings picker)
 *   - `GET /api/albums/{id}`     — album detail with its assets
 *   - `GET /api/assets/{id}/thumbnail?size=preview` — a preview-sized image
 *   - `GET /api/server/version`  — reported version (best-effort)
 *   - `GET /api/server/ping`     — reachability + key check
 *
 * The decrypted key never leaves the server: the browser pulls photos through
 * Hame's `/api/idle/photo/:id` proxy, so the screensaver works remotely without
 * exposing Immich (spec §8.14 "Backend Proxy (Privacy)").
 */

const REQUEST_TIMEOUT_MS = 15_000

export interface ImmichConnection {
  url: string
  apiKey: string
}

interface ImmichImage {
  contentType: string
  body: Buffer
}

function baseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function headers(apiKey: string): Record<string, string> {
  return { 'x-api-key': apiKey, accept: 'application/json' }
}

async function immichFetch(conn: ImmichConnection, path: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`${baseUrl(conn.url)}${path}`, {
      headers: headers(conn.apiKey),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

/** List the server's albums for the Settings picker. Throws on a non-OK response. */
export async function fetchAlbums(conn: ImmichConnection): Promise<ImmichAlbum[]> {
  const res = await immichFetch(conn, '/api/albums')
  if (!res.ok) throw new Error(`Immich responded ${res.status} listing albums`)
  return extractAlbums(await res.json())
}

/** Image asset ids in one album (videos skipped). Throws on a non-OK response. */
export async function fetchAlbumAssetIds(
  conn: ImmichConnection,
  albumId: string,
): Promise<string[]> {
  const res = await immichFetch(conn, `/api/albums/${encodeURIComponent(albumId)}`)
  if (!res.ok) throw new Error(`Immich responded ${res.status} reading album ${albumId}`)
  return extractImageAssetIds(await res.json())
}

/**
 * Collect image asset ids for the configured selection. An **empty** selection
 * means "all photos" — interpreted as every image across all albums (only the
 * rock-solid album endpoints, no reliance on Immich's shifting search API). A
 * single album that can't be read is skipped rather than failing the whole pool.
 */
export async function fetchAssetIds(
  conn: ImmichConnection,
  selectedAlbumIds: string[],
): Promise<string[]> {
  let albumIds = selectedAlbumIds
  if (albumIds.length === 0) albumIds = (await fetchAlbums(conn)).map((a) => a.id)

  const ids: string[] = []
  for (const albumId of albumIds) {
    try {
      ids.push(...(await fetchAlbumAssetIds(conn, albumId)))
    } catch {
      // Skip an unreadable album (e.g. deleted) — the rest of the pool stands.
    }
  }
  return ids
}

/** Fetch one asset's preview-sized image bytes, buffered for the proxy to relay. */
export async function fetchAssetPreview(
  conn: ImmichConnection,
  assetId: string,
): Promise<ImmichImage> {
  const res = await immichFetch(
    conn,
    `/api/assets/${encodeURIComponent(assetId)}/thumbnail?size=preview`,
  )
  if (!res.ok) throw new Error(`Immich responded ${res.status} fetching asset ${assetId}`)
  return {
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
    body: Buffer.from(await res.arrayBuffer()),
  }
}

/**
 * One-shot probe used by the Settings "Test connection" button against a
 * possibly-unsaved URL + key. Validates the key via `GET /api/albums` (200 = key
 * good) and reads the version best-effort. Never throws: a network failure or
 * bad key becomes a structured `{ ok: false }` result, like the HA probe.
 */
export async function testImmichConnection(url: string, apiKey: string): Promise<ImmichTestResult> {
  const conn = { url, apiKey }
  try {
    const res = await immichFetch(conn, '/api/albums')
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Connected, but the API key was rejected.' }
    }
    if (!res.ok) return { ok: false, message: `Immich responded ${res.status}.` }
    return { ok: true, message: 'Connected to Immich.', version: await fetchVersion(conn) }
  } catch {
    return { ok: false, message: 'Could not reach Immich at that URL.' }
  }
}

/** Best-effort version read; absence shouldn't fail an otherwise-good probe. */
async function fetchVersion(conn: ImmichConnection): Promise<string | undefined> {
  try {
    const res = await immichFetch(conn, '/api/server/version')
    if (!res.ok) return undefined
    const body = (await res.json()) as { major?: unknown; minor?: unknown; patch?: unknown }
    const parts = [body.major, body.minor, body.patch]
    if (parts.every((p) => typeof p === 'number')) return parts.join('.')
    return undefined
  } catch {
    return undefined
  }
}
