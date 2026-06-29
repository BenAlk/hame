import type {
  ImmichAlbum,
  ImmichConfig,
  ImmichTestResult,
  TestImmichInput,
  UpdateImmichConfigInput,
} from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'
import {
  buildAssetPool,
  fetchAlbums,
  fetchAssetIds,
  fetchAssetPreview,
  testImmichConnection,
  type ImmichConnection,
} from '../integrations/immich/index.js'

/** The Immich config row is a singleton (spec §10 Phase 7.3), keyed by this id. */
const SINGLETON_ID = 'singleton'

interface ConfigRow {
  url: string | null
  apiKey: string | null
  selectedAlbumIds: string[]
  isActive: boolean
  lastConnectedAt: Date | null
  updatedAt: Date
}

/** Project a row to the public read shape — *never* including the API key (only
 *  whether one is stored). `configured` gates the screensaver's photo mode. */
function toConfig(row: ConfigRow): ImmichConfig {
  return {
    url: row.url,
    hasApiKey: Boolean(row.apiKey),
    selectedAlbumIds: row.selectedAlbumIds,
    isActive: row.isActive,
    configured: Boolean(row.isActive && row.url && row.apiKey),
    lastConnectedAt: row.lastConnectedAt,
    updatedAt: row.updatedAt,
  }
}

/** Fetch the Immich config, creating the default (inactive) row on first access. */
export async function getImmichConfig(): Promise<ImmichConfig> {
  const row = await prisma.immichConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
  return toConfig(row)
}

export async function updateImmichConfig(input: UpdateImmichConfigInput): Promise<ImmichConfig> {
  // Encrypt the key only when one is supplied; omitting it keeps the stored blob,
  // so the form never has to round-trip the secret back to us (spec §11).
  const encryptedKey = input.apiKey !== undefined ? encryptSecret(input.apiKey) : undefined

  const row = await prisma.immichConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {
      url: input.url,
      ...(encryptedKey !== undefined && { apiKey: encryptedKey }),
      ...(input.selectedAlbumIds !== undefined && { selectedAlbumIds: input.selectedAlbumIds }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    create: {
      id: SINGLETON_ID,
      url: input.url,
      apiKey: encryptedKey ?? null,
      selectedAlbumIds: input.selectedAlbumIds ?? [],
      isActive: input.isActive ?? false,
    },
  })
  return toConfig(row)
}

/**
 * Test an unsaved URL + key pair (Settings "Test connection"). Stamps
 * `lastConnectedAt` on success against the URL already saved, mirroring the HA
 * probe's side effect.
 */
export async function testImmich(input: TestImmichInput): Promise<ImmichTestResult> {
  const result = await testImmichConnection(input.url, input.apiKey)
  if (result.ok) {
    await prisma.immichConfig
      .updateMany({
        where: { id: SINGLETON_ID, url: input.url },
        data: { lastConnectedAt: new Date() },
      })
      .catch(() => undefined)
  }
  return result
}

/**
 * List the configured server's albums for the Settings picker. Returns an empty
 * list when Immich isn't configured, and surfaces a 502 when it's configured but
 * unreachable — the same contract as the HA calendar list.
 */
export async function listImmichAlbums(): Promise<ImmichAlbum[]> {
  const conn = await getConnection()
  if (!conn) return []
  try {
    return await fetchAlbums(conn)
  } catch (err) {
    logger.warn({ err }, 'Could not list Immich albums')
    throw HttpError.badGateway('Could not reach Immich to list albums.')
  }
}

/**
 * The shuffled (or sequential) pool of image asset ids the screensaver cycles
 * (spec §8.14). Empty when Immich isn't configured — the screensaver then falls
 * back to clock-only. The bytes are pulled one at a time via `getPhoto`, so no
 * Immich credential ever reaches the browser.
 */
export async function getIdleAssetIds(shufflePhotos: boolean): Promise<string[]> {
  const conn = await getConnection()
  if (!conn) return []
  try {
    const ids = await fetchAssetIds(conn, conn.selectedAlbumIds)
    return buildAssetPool(ids, shufflePhotos)
  } catch (err) {
    logger.warn({ err }, 'Could not list Immich assets')
    return []
  }
}

/** Proxy one asset's preview bytes (spec §8.14 "Backend Proxy"). 502 if Immich
 *  is unreachable, 404 if it isn't configured. */
export async function getPhoto(assetId: string): Promise<{ contentType: string; body: Buffer }> {
  const conn = await getConnection()
  if (!conn) throw HttpError.notFound('Immich is not configured.')
  try {
    return await fetchAssetPreview(conn, assetId)
  } catch (err) {
    logger.warn({ err, assetId }, 'Could not fetch Immich photo')
    throw HttpError.badGateway('Could not fetch the photo from Immich.')
  }
}

/** Decrypted connection + selection, or null when incomplete/disabled. */
async function getConnection(): Promise<
  (ImmichConnection & { selectedAlbumIds: string[] }) | null
> {
  const row = await prisma.immichConfig.findUnique({ where: { id: SINGLETON_ID } })
  if (!row || !row.isActive || !row.url || !row.apiKey) return null
  return {
    url: row.url,
    apiKey: decryptSecret(row.apiKey),
    selectedAlbumIds: row.selectedAlbumIds,
  }
}
