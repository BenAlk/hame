import type {
  HaBinSensor,
  HaCalendar,
  HaServiceCallInput,
  HaServiceCallResult,
  HomeAssistantConfig,
  HomeAssistantTestResult,
  TestHomeAssistantInput,
  UpdateHomeAssistantConfigInput,
} from '@hame/shared'
import { isHaServiceAllowed } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'
import { haClient } from '../integrations/home-assistant/client.js'
import { testHomeAssistantConnection } from '../integrations/home-assistant/test-connection.js'
import { fetchHaCalendars } from '../integrations/home-assistant/calendars.js'
import {
  binGroupKey,
  binSensorScore,
  isBinSensor,
  readBinSensorDate,
} from '../integrations/bin-sources/ha-bin-source.js'

/** The HA config row is a singleton (spec §10 Phase 6), keyed by this id. */
const SINGLETON_ID = 'singleton'

interface ConfigRow {
  url: string | null
  accessToken: string | null
  isActive: boolean
  lastConnectedAt: Date | null
  updatedAt: Date
}

/** Project a row to the public read shape — overlaying the live socket status
 *  and *never* including the token (only whether one is stored). */
function toConfig(row: ConfigRow): HomeAssistantConfig {
  const { status, haVersion, lastError } = haClient.getStatus()
  return {
    url: row.url,
    hasToken: Boolean(row.accessToken),
    isActive: row.isActive,
    lastConnectedAt: row.lastConnectedAt,
    updatedAt: row.updatedAt,
    status,
    haVersion,
    lastError,
  }
}

/** Fetch the HA config, creating the default (inactive) row on first access. */
export async function getHomeAssistantConfig(): Promise<HomeAssistantConfig> {
  const row = await prisma.homeAssistantConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
  return toConfig(row)
}

export async function updateHomeAssistantConfig(
  input: UpdateHomeAssistantConfigInput,
): Promise<HomeAssistantConfig> {
  // Encrypt the token only when one is supplied; omitting it keeps the stored
  // blob, so the form never has to round-trip the secret back to us (spec §11).
  const encryptedToken =
    input.accessToken !== undefined ? encryptSecret(input.accessToken) : undefined

  const row = await prisma.homeAssistantConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {
      url: input.url,
      ...(encryptedToken !== undefined && { accessToken: encryptedToken }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    create: {
      id: SINGLETON_ID,
      url: input.url,
      accessToken: encryptedToken ?? null,
      isActive: input.isActive ?? false,
    },
  })

  // Reconnect (or disconnect) to match the saved config.
  haClient.reload(connectionSettings(row))
  return toConfig(row)
}

/**
 * Test an unsaved URL + token pair (Settings "Test connection"). Stamps
 * `lastConnectedAt` when the probe succeeds against the URL already saved,
 * mirroring the Ollama probe's side effect.
 */
export async function testHomeAssistant(
  input: TestHomeAssistantInput,
): Promise<HomeAssistantTestResult> {
  const result = await testHomeAssistantConnection(input.url, input.accessToken)
  if (result.ok) {
    await prisma.homeAssistantConfig
      .updateMany({
        where: { id: SINGLETON_ID, url: input.url },
        data: { lastConnectedAt: new Date() },
      })
      .catch(() => undefined)
  }
  return result
}

/**
 * Relay a device control to Home Assistant (spec §8.11, §10 Phase 6.3). The
 * (domain, service) pair is allowlisted by the request schema; we re-check it
 * here as defence in depth, then run it over the live socket. Never throws — a
 * down link or an HA-side failure comes back as a structured `{ ok: false }`,
 * the same graceful-degrade contract as the other integrations.
 */
export async function callHomeAssistantService(
  input: HaServiceCallInput,
): Promise<HaServiceCallResult> {
  if (!isHaServiceAllowed(input.domain, input.service)) {
    throw HttpError.badRequest('That Home Assistant service is not permitted.')
  }
  try {
    await haClient.callService(input.domain, input.service, input.entityId)
    return { ok: true, message: 'Done.' }
  } catch (err) {
    logger.warn({ err, ...input }, 'Home Assistant service call failed')
    return { ok: false, message: err instanceof Error ? err.message : 'Command failed.' }
  }
}

/**
 * List Home Assistant's calendar entities (spec §8.10, §10 Phase 6.3) so an admin
 * can add one as a `CalendarSource`. Returns an empty list when HA isn't
 * configured, and surfaces a 502 when it's configured but unreachable.
 */
export async function listHomeAssistantCalendars(): Promise<HaCalendar[]> {
  const settings = await getConnectionSettings()
  if (!settings) return []
  try {
    return await fetchHaCalendars(settings.url, settings.token)
  } catch (err) {
    logger.warn({ err }, 'Could not list Home Assistant calendars')
    throw HttpError.badGateway('Could not reach Home Assistant to list calendars.')
  }
}

/**
 * List the Home Assistant bin-collection sensors for the bin-source picker (spec
 * §8.9, §10 Phase 6). Reads the live entity registry (no HTTP). The "UK Bin
 * Collection Data" integration exposes several entities per bin (the date,
 * days-until, a label, the bin type), so bin-shaped sensors are grouped by bin
 * and one entry is offered per bin: the `entityId` of the canonical
 * next-collection-date sensor, plus the next date if HA currently has one.
 *
 * A bin whose sensors are all `unavailable` (HA hasn't resolved it yet) is still
 * listed with a null date — so the picker mirrors what HA shows, rather than
 * silently dropping a bin, and the date fills in once HA catches up. Empty when
 * HA isn't connected (the registry is then empty).
 */
export function listHomeAssistantBinSensors(): HaBinSensor[] {
  const byBin = new Map<string, { entityId: string; score: number; nextCollection: Date | null }>()
  for (const entity of haClient.getEntities()) {
    if (!isBinSensor(entity)) continue
    const key = binGroupKey(entity)
    const score = binSensorScore(entity)
    const date = readBinSensorDate(entity)
    const group = byBin.get(key)
    if (!group) {
      byBin.set(key, { entityId: entity.entityId, score, nextCollection: date })
      continue
    }
    // Keep the highest-scoring sensor's id (the dedicated date sensor)…
    if (score > group.score) {
      group.entityId = entity.entityId
      group.score = score
    }
    // …and the first readable date anywhere in the group, for the preview.
    if (!group.nextCollection && date) group.nextCollection = date
  }
  return [...byBin.entries()]
    .map(
      ([name, { entityId, nextCollection }]): HaBinSensor => ({ entityId, name, nextCollection }),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The decrypted connection settings for the WebSocket client, or null when the
 * config is incomplete or disabled. Used by the boot lifecycle (index.ts) and
 * the HA calendar/REST reads.
 */
export async function getConnectionSettings(): Promise<{ url: string; token: string } | null> {
  const row = await prisma.homeAssistantConfig.findUnique({ where: { id: SINGLETON_ID } })
  return row ? connectionSettings(row) : null
}

function connectionSettings(row: ConfigRow): { url: string; token: string } | null {
  if (!row.isActive || !row.url || !row.accessToken) return null
  return { url: row.url, token: decryptSecret(row.accessToken) }
}
