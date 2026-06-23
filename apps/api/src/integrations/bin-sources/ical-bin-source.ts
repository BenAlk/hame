/**
 * iCal bin-source provider (spec §8.9, §10 Phase 5.6 — the first external source).
 *
 * Many UK councils publish a household's kerbside schedule as an iCal feed: one
 * all-day VEVENT per collection, the bin named in the event title. This provider
 * reuses the Phase 5 calendar-subscription fetch/parse (`integrations/ical`, incl.
 * RRULE expansion) and maps the events to a single coloured bin's dates, keeping
 * only those whose title matches the bin (`sourceConfig.matchKey`) when set — so
 * one multi-bin feed can feed several coloured Hame bins.
 *
 * {@link mapICalToBinOccurrences} is the pure (events → dates) core and is unit
 * tested without the network; {@link icalBinProvider} is the thin fetch wrapper.
 */
import type { BinSourceConfig } from '@hame/shared'
import { fetchICalEvents, type ParsedSyncedEvent } from '../ical/index.js'
import type { BinScheduleProvider, BinSyncHorizon, FetchedBinOccurrence } from './index.js'

/** UTC midnight of an event's calendar day, matching how `@db.Date` rows store. */
function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/**
 * Turn parsed feed events into a bin's cache-ready collection dates. Filters to
 * the events whose title contains `matchKey` (when set; case-insensitive), keeps
 * only dates within the sync horizon, and de-duplicates a day repeated by the
 * feed. Pure — the service caches whatever this returns.
 */
export function mapICalToBinOccurrences(
  events: ParsedSyncedEvent[],
  config: BinSourceConfig,
  horizon: BinSyncHorizon,
): FetchedBinOccurrence[] {
  const match = config.matchKey?.trim().toLowerCase()
  const start = toUtcDateOnly(horizon.start).getTime()
  const end = toUtcDateOnly(horizon.end).getTime()
  const seen = new Set<number>()
  const out: FetchedBinOccurrence[] = []

  for (const ev of events) {
    if (match && !ev.title.toLowerCase().includes(match)) continue
    const date = toUtcDateOnly(ev.startTime)
    const t = date.getTime()
    if (t < start || t > end) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push({ date })
  }

  out.sort((a, b) => a.date.getTime() - b.date.getTime())
  return out
}

export const icalBinProvider: BinScheduleProvider = {
  type: 'ICAL',
  async fetchOccurrences(config, horizon) {
    if (!config.url) throw new Error('No iCal feed URL configured')
    const events = await fetchICalEvents(config.url)
    return mapICalToBinOccurrences(events, config, horizon)
  },
}
