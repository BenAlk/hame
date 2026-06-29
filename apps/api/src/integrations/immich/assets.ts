import type { ImmichAlbum } from '@hame/shared'

/**
 * Pure, network-free helpers for the Immich integration (spec §8.14, §10 Phase
 * 7.3). Kept socket-free so album/asset parsing and pool selection are
 * unit-tested without a live Immich — the same split as the HA entity helpers.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** Map Immich's `GET /api/albums` response to the picker shape (id + name + count). */
export function extractAlbums(raw: unknown): ImmichAlbum[] {
  if (!Array.isArray(raw)) return []
  const albums: ImmichAlbum[] = []
  for (const entry of raw) {
    const rec = asRecord(entry)
    if (!rec || typeof rec.id !== 'string') continue
    const name = typeof rec.albumName === 'string' ? rec.albumName : rec.id
    const count =
      typeof rec.assetCount === 'number' && Number.isFinite(rec.assetCount) ? rec.assetCount : 0
    albums.push({ id: rec.id, name, assetCount: count })
  }
  return albums
}

/**
 * Pull the **image** asset ids out of an `GET /api/albums/{id}` detail response.
 * Videos are skipped — the screensaver shows stills only. Tolerant of a missing
 * `type` (treated as an image), so an older Immich that omits it still works.
 */
export function extractImageAssetIds(raw: unknown): string[] {
  const rec = asRecord(raw)
  const assets = rec?.assets
  if (!Array.isArray(assets)) return []
  const ids: string[] = []
  for (const entry of assets) {
    const asset = asRecord(entry)
    if (!asset || typeof asset.id !== 'string') continue
    if (typeof asset.type === 'string' && asset.type.toUpperCase() !== 'IMAGE') continue
    ids.push(asset.id)
  }
  return ids
}

/** In-place Fisher–Yates shuffle, with an injectable RNG so it's deterministic in tests. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Build the asset pool the screensaver cycles: de-duplicated (an asset can sit
 * in several albums), then shuffled or left in album order. The frontend fetches
 * each id's bytes one at a time through the backend proxy.
 */
export function buildAssetPool(
  ids: readonly string[],
  shufflePhotos: boolean,
  rng: () => number = Math.random,
): string[] {
  const unique = [...new Set(ids)]
  return shufflePhotos ? shuffle(unique, rng) : unique
}
