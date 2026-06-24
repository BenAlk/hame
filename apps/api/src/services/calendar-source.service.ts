import type { Prisma } from '@prisma/client'
import type {
  CalendarSource,
  CalendarSyncResult,
  CreateCalendarSourceInput,
  UpdateCalendarSourceInput,
} from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'
import { fetchICalEvents, type ParsedSyncedEvent } from '../integrations/ical/index.js'
import { fetchHaCalendarEvents } from '../integrations/home-assistant/calendars.js'
import { getConnectionSettings } from './home-assistant-config.service.js'

// HA calendars are queried over an explicit window (iCal feeds carry their own
// horizon); match the iCal expansion range — a month back, ~a year ahead.
const HA_HORIZON_PAST_DAYS = 31
const HA_HORIZON_FUTURE_DAYS = 366

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

const sourceInclude = {
  _count: { select: { events: true } },
} as const satisfies Prisma.CalendarSourceInclude

type SourceRow = Prisma.CalendarSourceGetPayload<{ include: typeof sourceInclude }>

export function toCalendarSource(row: SourceRow): CalendarSource {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    url: row.url,
    colour: row.colour,
    isActive: row.isActive,
    lastSyncedAt: row.lastSyncedAt,
    eventCount: row._count.events,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listCalendarSources(): Promise<CalendarSource[]> {
  const rows = await prisma.calendarSource.findMany({
    include: sourceInclude,
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(toCalendarSource)
}

async function getRow(id: string): Promise<SourceRow> {
  const row = await prisma.calendarSource.findUnique({ where: { id }, include: sourceInclude })
  if (!row) throw HttpError.notFound('Calendar source not found')
  return row
}

export async function createCalendarSource(
  input: CreateCalendarSourceInput,
): Promise<CalendarSource> {
  const row = await prisma.calendarSource.create({
    data: { name: input.name, url: input.url, colour: input.colour, type: input.type },
    include: sourceInclude,
  })
  // Best-effort first sync so it populates immediately; failures don't block creation.
  await syncCalendarSource(row.id).catch((err) =>
    logger.warn({ err, sourceId: row.id }, 'Initial calendar sync failed'),
  )
  return getRow(row.id).then(toCalendarSource)
}

export async function updateCalendarSource(
  id: string,
  input: UpdateCalendarSourceInput,
): Promise<CalendarSource> {
  await getRow(id)
  const row = await prisma.calendarSource.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.colour !== undefined && { colour: input.colour }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: sourceInclude,
  })
  return toCalendarSource(row)
}

export async function deleteCalendarSource(id: string): Promise<void> {
  await getRow(id)
  await prisma.calendarSource.delete({ where: { id } }) // events cascade
}

/**
 * Fetch an external source and replace its cached events wholesale (a derived
 * cache, so delete-then-insert is the simplest correct strategy). Stamps
 * `lastSyncedAt`. Dispatches by type — an iCal feed URL or, since Phase 6.3, a
 * Home Assistant `calendar.*` entity (the entity id is held in `source.url`).
 */
export async function syncCalendarSource(id: string): Promise<CalendarSyncResult> {
  const source = await prisma.calendarSource.findUnique({ where: { id } })
  if (!source) throw HttpError.notFound('Calendar source not found')

  let events: ParsedSyncedEvent[]
  try {
    events =
      source.type === 'HOME_ASSISTANT'
        ? await fetchHaCalendarSourceEvents(source.url)
        : await fetchICalEvents(source.url)
  } catch (err) {
    logger.warn({ err, sourceId: id }, 'Calendar sync fetch failed')
    return {
      ok: false,
      count: 0,
      message: `Could not fetch the calendar (${err instanceof Error ? err.message : 'unknown error'}).`,
    }
  }

  await prisma.$transaction([
    prisma.syncedEvent.deleteMany({ where: { sourceId: id } }),
    prisma.syncedEvent.createMany({
      data: events.map((e) => ({
        sourceId: id,
        externalId: e.externalId,
        title: e.title,
        description: e.description,
        startTime: e.startTime,
        endTime: e.endTime,
        allDay: e.allDay,
      })),
      skipDuplicates: true, // a feed can repeat a UID+occurrence; keep the first
    }),
    prisma.calendarSource.update({ where: { id }, data: { lastSyncedAt: new Date() } }),
  ])

  return { ok: true, count: events.length, message: `Synced ${events.length} events.` }
}

/** Read a HOME_ASSISTANT source's events: its `url` holds the calendar entity id. */
async function fetchHaCalendarSourceEvents(entityId: string): Promise<ParsedSyncedEvent[]> {
  const settings = await getConnectionSettings()
  if (!settings) throw new Error('Home Assistant is not connected')
  const now = new Date()
  return fetchHaCalendarEvents(
    settings.url,
    settings.token,
    entityId,
    addDays(now, -HA_HORIZON_PAST_DAYS),
    addDays(now, HA_HORIZON_FUTURE_DAYS),
  )
}

/** Sync every active external source — the cron entry point. Never throws. */
export async function syncAllActiveSources(): Promise<void> {
  const sources = await prisma.calendarSource.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })
  for (const source of sources) {
    const result = await syncCalendarSource(source.id).catch((err) => {
      logger.warn({ err, sourceId: source.id }, 'Scheduled calendar sync failed')
      return null
    })
    if (result?.ok) logger.info({ source: source.name, count: result.count }, 'Calendar synced')
  }
}
