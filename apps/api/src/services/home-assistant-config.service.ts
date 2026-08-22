import type {
  HaBinSensor,
  HaCalendar,
  HaForecastEntry,
  HaForecastType,
  HaNotifyTarget,
  HaServiceCallInput,
  HaServiceCallResult,
  HomeAssistantConfig,
  HomeAssistantTestResult,
  TestHomeAssistantInput,
  UpdateHomeAssistantConfigInput,
} from '@hame/shared'
import {
  clampSetpoint,
  haClimateView,
  isHaServiceAllowed,
  sanitiseHaServiceData,
} from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'
import { haClient } from '../integrations/home-assistant/client.js'
import { entityDomain } from '../integrations/home-assistant/entities.js'
import { testHomeAssistantConnection } from '../integrations/home-assistant/test-connection.js'
import { fetchHaCalendars } from '../integrations/home-assistant/calendars.js'
import { mapHaForecast } from '../integrations/home-assistant/forecast.js'
import {
  enrichWithDeviceNames,
  fetchNotifyTargets,
} from '../integrations/home-assistant/notifications.js'
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
 *
 * Services that take arguments (heating setpoints) get two further checks: the
 * payload is re-parsed against that service's declared shape so only known keys
 * travel, and a setpoint is then held inside the *device's* own advertised range
 * rather than the schema's coarse envelope.
 */
export async function callHomeAssistantService(
  input: HaServiceCallInput,
): Promise<HaServiceCallResult> {
  if (!isHaServiceAllowed(input.domain, input.service)) {
    throw HttpError.badRequest('That Home Assistant service is not permitted.')
  }
  // An allowlisted domain must not be aimed at another domain's entity — that
  // would let one permitted (domain, service) pair act outside its allowlist row.
  if (entityDomain(input.entityId) !== input.domain) {
    throw HttpError.badRequest('That entity does not belong to that domain.')
  }

  let data: Record<string, unknown> | undefined
  try {
    data = sanitiseHaServiceData(input.domain, input.service, input.data)
  } catch {
    throw HttpError.badRequest('Invalid arguments for that Home Assistant service.')
  }
  data = clampSetpointToDevice(input, data)
  requirePresetTheDeviceOffers(input, data)

  try {
    await haClient.callService(input.domain, input.service, input.entityId, data)
    return { ok: true, message: 'Done.' }
  } catch (err) {
    logger.warn({ err, ...input }, 'Home Assistant service call failed')
    return { ok: false, message: err instanceof Error ? err.message : 'Command failed.' }
  }
}

/**
 * Hold a target temperature inside the range the device itself advertises, and
 * on its own step. The request schema can only enforce the absolute envelope
 * (§11) because the device's range is live state, not a constant — so the real
 * bound is applied here, where the registry is. An entity HA isn't currently
 * tracking keeps the envelope's bound and is relayed anyway: HA is the final
 * authority on its own device, and refusing would break the control whenever the
 * registry is mid-reconnect.
 */
function clampSetpointToDevice(
  input: HaServiceCallInput,
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (input.domain !== 'climate' || input.service !== 'set_temperature') return data
  const temperature = data?.temperature
  if (typeof temperature !== 'number') return data

  const entity = haClient.getEntity(input.entityId)
  if (!entity) return data
  return { ...data, temperature: clampSetpoint(temperature, haClimateView(entity)) }
}

/**
 * Refuse a preset the device doesn't advertise (spec §10 Phase 23).
 *
 * A preset's vocabulary is the integration's, not Home Assistant's — `auto` and
 * `manual` on a Tuya thermostat, `eco` or `boost` elsewhere — so the request
 * schema can only bound the *shape* of the string. The meaning has to be checked
 * against the entity's own `preset_modes`, which is live state and therefore
 * belongs here, exactly as the setpoint's real range does.
 *
 * Same seam, opposite treatment, and deliberately so: an out-of-range setpoint is
 * clamped to something safe because a number has a nearest legal value, while a
 * preset has no nearest anything — an unrecognised one can only be refused. An
 * entity the registry isn't tracking is relayed unchecked, as with the clamp: HA
 * is the final authority on its own device, and refusing would break the control
 * whenever the registry is mid-reconnect.
 */
function requirePresetTheDeviceOffers(
  input: HaServiceCallInput,
  data: Record<string, unknown> | undefined,
): void {
  if (input.domain !== 'climate' || input.service !== 'set_preset_mode') return
  const preset = data?.preset_mode
  if (typeof preset !== 'string') return

  const entity = haClient.getEntity(input.entityId)
  if (!entity) return
  const { presets } = haClimateView(entity)
  if (presets.length > 0 && !presets.includes(preset)) {
    throw HttpError.badRequest('That thermostat does not offer that mode.')
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
 * Fetch a weather entity's forecast (spec §10, weather forecast modal). Goes
 * over the already-open WS — HA has no REST equivalent for forecasts, unlike
 * calendars — so there's no separate "configured but unreachable" check beyond
 * the client's own connection state, which `getForecast` already rejects on.
 */
export async function getHomeAssistantForecast(
  entityId: string,
  forecastType: HaForecastType,
): Promise<HaForecastEntry[]> {
  try {
    const result = await haClient.getForecast(entityId, forecastType)
    return mapHaForecast(result, entityId)
  } catch (err) {
    logger.warn({ err, entityId, forecastType }, 'Could not fetch Home Assistant forecast')
    throw HttpError.badGateway('Could not reach Home Assistant to fetch the forecast.')
  }
}

/**
 * List the Home Assistant `notify.*` services (spec §8.13, §10 Phase 8) so a user
 * can pick their phone for push reminders. Member-level data (no token), mirroring
 * `listHomeAssistantCalendars`: empty when HA isn't configured, 502 when it's
 * configured but unreachable.
 */
export async function listHomeAssistantNotifyTargets(): Promise<HaNotifyTarget[]> {
  const settings = await getConnectionSettings()
  if (!settings) return []

  let targets: HaNotifyTarget[]
  try {
    targets = await fetchNotifyTargets(settings.url, settings.token)
  } catch (err) {
    logger.warn({ err }, 'Could not list Home Assistant notify targets')
    throw HttpError.badGateway('Could not reach Home Assistant to list notify targets.')
  }

  // Best-effort: overlay friendly device-registry names (WS-only, spec §10 Phase 8).
  // If the socket isn't connected or the lookup fails, keep the slug-derived labels.
  try {
    const devices = await haClient.fetchDeviceRegistry()
    return enrichWithDeviceNames(targets, devices)
  } catch (err) {
    logger.debug({ err }, 'Device registry unavailable; using slug notify labels')
    return targets
  }
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
