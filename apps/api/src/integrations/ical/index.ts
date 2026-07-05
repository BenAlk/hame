/**
 * iCal feed parsing (spec §8.10). Fetches an external calendar URL and turns its
 * VEVENTs into flat, cache-ready rows, expanding recurring events (RRULE) across
 * a bounded horizon so the household sees upcoming occurrences.
 *
 * {@link parseICalEvents} is pure (string → rows) and unit-tested without the
 * network; {@link fetchICalEvents} is the thin fetch wrapper around it.
 */
import ical, { type VEvent } from 'node-ical'
import { safeFetch } from '../../lib/safe-fetch.js'

/** One external event, ready to persist as a `SyncedEvent`. */
export interface ParsedSyncedEvent {
  externalId: string
  title: string
  description: string | null
  startTime: Date
  endTime: Date | null
  allDay: boolean
}

const FETCH_TIMEOUT_MS = 15_000
// Expansion horizon: enough history to cover a month-back view, ~a year ahead.
const HORIZON_PAST_DAYS = 31
const HORIZON_FUTURE_DAYS = 366
// Safety cap on occurrences per recurring event, so a pathological RRULE can't blow up.
const MAX_OCCURRENCES = 1000

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Parse an iCal document into cache-ready event rows. Pure. */
export function parseICalEvents(ics: string, now: Date = new Date()): ParsedSyncedEvent[] {
  const data = ical.parseICS(ics)
  const rangeStart = addDays(now, -HORIZON_PAST_DAYS)
  const rangeEnd = addDays(now, HORIZON_FUTURE_DAYS)
  const out: ParsedSyncedEvent[] = []

  for (const value of Object.values(data)) {
    if (!value || value.type !== 'VEVENT' || !value.start) continue
    const ev = value as VEvent
    const allDay = ev.datetype === 'date'
    const durationMs = ev.end ? +ev.end - +ev.start : 0
    const title = String(ev.summary ?? '(untitled)')
    const description = ev.description ? String(ev.description) : null
    const uid = ev.uid ?? ev.start.toISOString()

    if (ev.rrule) {
      const exdates = new Set(
        Object.values(ev.exdate ?? {}).map((d) => dayKey(new Date(d as unknown as Date))),
      )
      const occurrences = ev.rrule.between(rangeStart, rangeEnd, true).slice(0, MAX_OCCURRENCES)
      for (const occ of occurrences) {
        if (exdates.has(dayKey(occ))) continue
        // A modified instance (RECURRENCE-ID) overrides the generated occurrence.
        const override = ev.recurrences?.[dayKey(occ)] ?? ev.recurrences?.[occ.toISOString()]
        const start = override?.start ? new Date(override.start as unknown as Date) : occ
        const end = override?.end
          ? new Date(override.end as unknown as Date)
          : new Date(+start + durationMs)
        out.push({
          externalId: `${uid}-${start.toISOString()}`,
          title: String(override?.summary ?? title),
          description,
          startTime: start,
          endTime: durationMs > 0 ? end : null,
          allDay,
        })
      }
    } else {
      if (+ev.start < +rangeStart || +ev.start > +rangeEnd) continue // outside the horizon
      out.push({
        externalId: uid,
        title,
        description,
        startTime: ev.start,
        endTime: ev.end ?? null,
        allDay,
      })
    }
  }

  return out
}

/** Fetch an iCal URL and parse it. Throws on network/HTTP failure. */
export async function fetchICalEvents(url: string): Promise<ParsedSyncedEvent[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await safeFetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; HameCalendarSync/1.0)' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Calendar responded ${res.status}`)
    return parseICalEvents(await res.text())
  } finally {
    clearTimeout(timeout)
  }
}
