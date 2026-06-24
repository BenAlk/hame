/**
 * Home Assistant calendar reads (spec §8.10, §10 Phase 6.3). HA exposes calendars
 * (Google, CalDAV, local) as `calendar.*` entities with a small REST surface:
 *
 *   GET /api/calendars                         → [{ entity_id, name }]
 *   GET /api/calendars/<entity>?start=&end=    → [{ start, end, summary, ... }]
 *
 * A `CalendarSource` of type HOME_ASSISTANT stores the chosen entity id in its
 * `url` field; {@link syncCalendarSource} fetches its events for the sync horizon
 * and caches them as `SyncedEvent` rows, exactly like an iCal feed — so HA
 * calendars surface in the aggregated calendar (§8.10) alongside everything else.
 *
 * {@link mapHaCalendarEvents} is the pure (raw JSON → rows) core, unit-tested
 * without the network; the `fetch*` wrappers add the REST call and auth header.
 */
import type { HaCalendar } from '@hame/shared'
import type { ParsedSyncedEvent } from '../ical/index.js'

const FETCH_TIMEOUT_MS = 15_000

/** HA's calendar-event JSON: start/end are either a date-time or an all-day date. */
interface RawHaCalendarEvent {
  start?: { dateTime?: unknown; date?: unknown }
  end?: { dateTime?: unknown; date?: unknown }
  summary?: unknown
  description?: unknown
  uid?: unknown
  recurrence_id?: unknown
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function getJson(url: string, token: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: authHeaders(token), signal: controller.signal })
    if (!res.ok) throw new Error(`Home Assistant responded ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

/** List HA's calendar entities for the source picker. Throws on fetch failure. */
export async function fetchHaCalendars(baseUrl: string, token: string): Promise<HaCalendar[]> {
  const base = baseUrl.replace(/\/+$/, '')
  const body = await getJson(`${base}/api/calendars`, token)
  if (!Array.isArray(body)) return []
  return body
    .map((c): HaCalendar | null => {
      if (!c || typeof c !== 'object') return null
      const entityId = (c as { entity_id?: unknown }).entity_id
      if (typeof entityId !== 'string') return null
      const name = (c as { name?: unknown }).name
      return { entityId, name: typeof name === 'string' ? name : entityId }
    })
    .filter((c): c is HaCalendar => c !== null)
}

/** Project one HA calendar's events (already expanded by HA) to cache-ready rows. */
export function mapHaCalendarEvents(raw: unknown, entityId: string): ParsedSyncedEvent[] {
  if (!Array.isArray(raw)) return []
  const out: ParsedSyncedEvent[] = []
  const seen = new Set<string>()

  for (const value of raw as RawHaCalendarEvent[]) {
    if (!value || typeof value !== 'object') continue
    const start = parseEdge(value.start)
    if (!start) continue
    const end = parseEdge(value.end)
    const title = typeof value.summary === 'string' ? value.summary : '(untitled)'
    const uid =
      typeof value.uid === 'string' ? value.uid : `${entityId}:${start.date.toISOString()}`
    // HA expands recurrences itself, so a uid can repeat across occurrences —
    // key the cache row by uid + start to keep each distinct (cf. the iCal path).
    const externalId = `${uid}-${start.date.toISOString()}`
    if (seen.has(externalId)) continue
    seen.add(externalId)

    out.push({
      externalId,
      title,
      description: typeof value.description === 'string' ? value.description : null,
      startTime: start.date,
      endTime: end?.date ?? null,
      allDay: start.allDay,
    })
  }

  out.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  return out
}

/** Parse an HA event edge: `{ dateTime }` (timed) or `{ date }` (all-day). */
function parseEdge(edge: RawHaCalendarEvent['start']): { date: Date; allDay: boolean } | null {
  if (!edge || typeof edge !== 'object') return null
  if (typeof edge.dateTime === 'string') {
    const date = new Date(edge.dateTime)
    return Number.isNaN(date.getTime()) ? null : { date, allDay: false }
  }
  if (typeof edge.date === 'string') {
    // All-day: "YYYY-MM-DD" parses to UTC midnight, matching how @db.Date rows store.
    const date = new Date(edge.date)
    return Number.isNaN(date.getTime()) ? null : { date, allDay: true }
  }
  return null
}

/** Fetch one HA calendar's events across [start, end]. Throws on fetch failure. */
export async function fetchHaCalendarEvents(
  baseUrl: string,
  token: string,
  entityId: string,
  start: Date,
  end: Date,
): Promise<ParsedSyncedEvent[]> {
  const base = baseUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
  const body = await getJson(
    `${base}/api/calendars/${encodeURIComponent(entityId)}?${params}`,
    token,
  )
  return mapHaCalendarEvents(body, entityId)
}
