import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { CreateCustomEventInput, CustomEvent, UpdateCustomEventInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { toMemberSummary } from './user.service.js'
import { buildEventICal, icalEtag } from '../lib/icalendar.js'

const eventInclude = {
  createdBy: { select: { id: true, firstName: true, colour: true } },
} as const satisfies Prisma.CalendarObjectInclude

type EventRow = Prisma.CalendarObjectGetPayload<{ include: typeof eventInclude }>

/** The structured fields an event carries; the iCalendar text is derived from these. */
interface EventFields {
  title: string
  description: string | null
  startTime: Date
  endTime: Date | null
  allDay: boolean
}

/** Canonical iCalendar text + its etag for a Hame-authored event. */
function renderIcal(uid: string, fields: EventFields): { icalRaw: string; etag: string } {
  const icalRaw = buildEventICal({ uid, ...fields })
  return { icalRaw, etag: icalEtag(icalRaw) }
}

/** Public shape — drops the CalDAV plumbing (uid/etag/icalRaw) the web doesn't need. */
export function toCustomEvent(row: EventRow): CustomEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startTime: row.startTime,
    endTime: row.endTime,
    allDay: row.allDay,
    colour: row.colour,
    createdBy: toMemberSummary(row.createdBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Events overlapping a date window (start before `to`, end on/after `from`). */
export async function listCustomEvents(
  opts: { from?: Date; to?: Date } = {},
): Promise<CustomEvent[]> {
  const where: Prisma.CalendarObjectWhereInput = {}
  if (opts.to) where.startTime = { lte: opts.to }
  if (opts.from) {
    where.OR = [{ endTime: { gte: opts.from } }, { endTime: null, startTime: { gte: opts.from } }]
  }
  const rows = await prisma.calendarObject.findMany({
    where,
    include: eventInclude,
    orderBy: { startTime: 'asc' },
  })
  return rows.map(toCustomEvent)
}

export async function createCustomEvent(
  input: CreateCustomEventInput,
  userId: string,
): Promise<CustomEvent> {
  const uid = `${randomUUID()}@hame`
  const fields: EventFields = {
    title: input.title,
    description: input.description ?? null,
    startTime: input.startTime,
    endTime: input.endTime ?? null,
    allDay: input.allDay ?? false,
  }
  const { icalRaw, etag } = renderIcal(uid, fields)
  const row = await prisma.calendarObject.create({
    data: { uid, etag, icalRaw, ...fields, colour: input.colour ?? null, createdById: userId },
    include: eventInclude,
  })
  return toCustomEvent(row)
}

export async function updateCustomEvent(
  id: string,
  input: UpdateCustomEventInput,
): Promise<CustomEvent> {
  const existing = await prisma.calendarObject.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Event not found')

  // Merge the patch over the current values, then re-derive the iCalendar text.
  const fields: EventFields = {
    title: input.title ?? existing.title,
    description: input.description !== undefined ? input.description : existing.description,
    startTime: input.startTime ?? existing.startTime,
    endTime: input.endTime !== undefined ? input.endTime : existing.endTime,
    allDay: input.allDay ?? existing.allDay,
  }
  const { icalRaw, etag } = renderIcal(existing.uid, fields)
  const row = await prisma.calendarObject.update({
    where: { id },
    data: {
      ...fields,
      ...(input.colour !== undefined && { colour: input.colour }),
      etag,
      icalRaw,
    },
    include: eventInclude,
  })
  return toCustomEvent(row)
}

export async function deleteCustomEvent(id: string): Promise<void> {
  const existing = await prisma.calendarObject.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Event not found')
  await prisma.calendarObject.delete({ where: { id } })
}
