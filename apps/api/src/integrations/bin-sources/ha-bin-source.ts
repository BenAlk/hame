/**
 * Home Assistant bin-source provider (spec §8.9, §9.6, §10 Phase 6 — the last
 * unwired external source).
 *
 * The community "UK Bin Collection Data" integration (HACS) exposes each bin as a
 * `sensor.*` whose value is the *next* collection date. Hame already keeps every
 * dashboard-domain sensor live in the WebSocket client's in-memory registry
 * (spec §8.11, §10 Phase 6.2), so this provider reads from there — no extra HTTP
 * — and maps the sensor's next-collection date to a cache-ready occurrence.
 *
 * Like HA itself, the sensor only knows the *next* date, so a sync caches that one
 * occurrence; the nightly `BIN_SYNC_CRON` re-reads it, so each collection rolls
 * forward and the cache self-corrects (§9.6) — the same observe-then-cache shape
 * as the scraper, minus the projection (HA has done that work).
 *
 * {@link parseBinSensorDate} and {@link haEntityToBinOccurrences} are the pure,
 * socket-free core (unit-tested without a live connection); {@link haBinProvider}
 * is the thin registry read, matching the auth/entity helper split elsewhere.
 */
import type { BinSourceConfig, HaEntityState } from '@hame/shared'
import { haClient } from '../home-assistant/client.js'
import type { BinScheduleProvider, BinSyncHorizon, FetchedBinOccurrence } from './index.js'

/** Names that mark a sensor as a bin/waste collection one (for the form picker). */
const BIN_SENSOR_RE = /bin|waste|recycl|refuse|rubbish|garbage|kerbside|collection/i

/**
 * Sensor attributes (normalised to lowercase alphanumerics) that may carry the
 * next-collection date, in priority order. Covers the integration's
 * `next_collection` / `Next Collection` plus common variants, before the state.
 */
const DATE_ATTR_KEYS = ['nextcollection', 'collectiondate', 'nextdate', 'date'] as const

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** UTC midnight of a Date's calendar day, matching how `@db.Date` rows store. */
function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/** Build a validated UTC-midnight date, rejecting impossible days (e.g. 31 Feb). */
function buildUtcDate(year: number, month1to12: number, day: number): Date | null {
  if (month1to12 < 1 || month1to12 > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month1to12 - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month1to12 - 1 ||
    date.getUTCDate() !== day
  ) {
    return null // the date overflowed (e.g. 30 Feb → 2 Mar)
  }
  return date
}

/**
 * Parse a bin sensor's date string to UTC midnight, or null if unreadable. Accepts
 * ISO `YYYY-MM-DD` (and the date part of an ISO datetime) and UK day-first
 * `DD/MM/YYYY` / `DD-MM-YYYY` — the formats this UK-only integration emits. A
 * bare days-count or a fuzzy label ("Tomorrow") returns null, so the caller falls
 * back to the next candidate rather than mis-dating a collection.
 */
export function parseBinSensorDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(v)
  if (iso) return buildUtcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v)
  if (dmy) return buildUtcDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  return null
}

/**
 * The next-collection date a bin sensor reports, or null if none is readable.
 * Tries the date-bearing attributes in priority order, then the state.
 */
export function readBinSensorDate(entity: HaEntityState): Date | null {
  const attributes = entity.attributes ?? {}
  for (const target of DATE_ATTR_KEYS) {
    for (const [key, raw] of Object.entries(attributes)) {
      if (normaliseKey(key) !== target) continue
      const date = parseBinSensorDate(raw)
      if (date) return date
    }
  }
  return parseBinSensorDate(entity.state)
}

/**
 * Per-bin facet phrases the "UK Bin Collection Data" integration appends — it
 * exposes several sensors for one bin (the date, days-until, a human-readable
 * label, the bin type), all carrying the same next date. Stripping the trailing
 * facet collapses them to one group key, so the picker offers one entry per bin.
 */
const FACET_SUFFIX_RE =
  /\s*[-–:]?\s*(next collection date|next collection human readable|human readable|days until collection|days until|next collection|collection date|bin type|colour|color)\s*$/i

/** The bin a sensor belongs to: its name with any trailing facet phrase stripped. */
export function binGroupKey(entity: HaEntityState): string {
  const base = entity.friendlyName ?? entity.entityId
  let key = base
  for (let prev = ''; prev !== key; ) {
    prev = key
    key = key.replace(FACET_SUFFIX_RE, '')
  }
  return key.replace(/[\s\-–:]+$/, '').trim() || base
}

/** Rank a bin group's sensors so the dedicated next-collection-date one wins. */
export function binSensorScore(entity: HaEntityState): number {
  let score = 0
  if (parseBinSensorDate(entity.state)) score += 2 // a real date sensor, not a count/label
  if (/collection date/i.test(entity.friendlyName ?? entity.entityId)) score += 1
  return score
}

/** Does this entity look like a bin/waste collection sensor (by id or name)? */
export function isBinSensor(entity: HaEntityState): boolean {
  if (entity.domain !== 'sensor') return false
  return (
    BIN_SENSOR_RE.test(entity.entityId) ||
    (entity.friendlyName !== null && BIN_SENSOR_RE.test(entity.friendlyName))
  )
}

/**
 * Map a bin sensor's next-collection date to a cache-ready occurrence. Throws when
 * the sensor carries no readable date or it falls outside the sync window — so the
 * service degrades gracefully and keeps the existing cache rather than wiping it.
 */
export function haEntityToBinOccurrences(
  entity: HaEntityState,
  horizon: BinSyncHorizon,
): FetchedBinOccurrence[] {
  const date = readBinSensorDate(entity)
  if (!date) throw new Error(`No collection date found on "${entity.entityId}"`)
  const t = date.getTime()
  if (t < toUtcDateOnly(horizon.start).getTime() || t > toUtcDateOnly(horizon.end).getTime()) {
    throw new Error(`"${entity.entityId}" reports a collection outside the sync window`)
  }
  return [{ date }]
}

/** Read the chosen sensor from the live registry and map it. Throws on miss. */
function fetchHaBinOccurrences(
  config: BinSourceConfig,
  horizon: BinSyncHorizon,
): FetchedBinOccurrence[] {
  if (!config.entityId) throw new Error('A Home Assistant entity is required')
  if (haClient.getStatus().status !== 'connected') {
    throw new Error('Home Assistant is not connected')
  }
  const entity = haClient.getEntities().find((e) => e.entityId === config.entityId)
  if (!entity) throw new Error(`Home Assistant entity "${config.entityId}" was not found`)
  return haEntityToBinOccurrences(entity, horizon)
}

export const haBinProvider: BinScheduleProvider = {
  type: 'HOME_ASSISTANT',
  // The registry read is synchronous; wrap it so a throw becomes a rejection the
  // bin service can degrade gracefully on (cache kept), like the other providers.
  fetchOccurrences: (config, horizon) =>
    Promise.resolve().then(() => fetchHaBinOccurrences(config, horizon)),
}
