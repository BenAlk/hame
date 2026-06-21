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
import { fetchICalEvents } from '../integrations/ical/index.js'

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
 * Fetch an iCal source and replace its cached events wholesale (a derived cache,
 * so delete-then-insert is the simplest correct strategy). Stamps `lastSyncedAt`.
 * HOME_ASSISTANT sources are skipped until Phase 6.
 */
export async function syncCalendarSource(id: string): Promise<CalendarSyncResult> {
  const source = await prisma.calendarSource.findUnique({ where: { id } })
  if (!source) throw HttpError.notFound('Calendar source not found')
  if (source.type !== 'ICAL') {
    return { ok: false, count: 0, message: 'Only iCal sources sync today.' }
  }

  let events
  try {
    events = await fetchICalEvents(source.url)
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

/** Sync every active iCal source — the cron entry point. Never throws. */
export async function syncAllActiveSources(): Promise<void> {
  const sources = await prisma.calendarSource.findMany({
    where: { isActive: true, type: 'ICAL' },
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
