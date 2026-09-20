import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type {
  BinScheduleRule,
  CreateCustomEventInput,
  CustomEvent,
  UpdateCustomEventInput,
} from '@hame/shared'
import { nextBinCollection } from '@hame/shared'
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

/** Midnight of `d`, as a new Date (never mutates the input). */
function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Whether `a` and `b` fall on the same calendar day. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** `d` shifted by `n` whole days. */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
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
    // `ONE_OFF` is never actually written to this column (enforced by
    // `EventRecurrenceTypeSchema`) — narrowed here since Prisma's generated
    // type still allows the full four-value `RecurrenceType` enum.
    recurrenceType: row.recurrenceType === 'ONE_OFF' ? null : row.recurrenceType,
    intervalDays: row.intervalDays,
    weekdays: row.weekdays,
    dayOfMonth: row.dayOfMonth,
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
    data: {
      uid,
      etag,
      icalRaw,
      ...fields,
      colour: input.colour ?? null,
      createdById: userId,
      ...(input.recurrenceType && {
        recurrenceType: input.recurrenceType,
        intervalDays: input.intervalDays ?? null,
        weekdays: input.weekdays ?? [],
        dayOfMonth: input.dayOfMonth ?? null,
        recurrenceAnchor: startOfDay(fields.startTime),
      }),
    },
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

  const recurrenceType =
    input.recurrenceType !== undefined ? input.recurrenceType : existing.recurrenceType
  // The anchor is immutable once set, *except* it must follow the event's own
  // day if that's what actually changed — turning recurrence on for the first
  // time, or moving a repeating event's date, both need a fresh anchor.
  const recurrenceAnchor =
    !existing.recurrenceType || !isSameDay(fields.startTime, existing.startTime)
      ? startOfDay(fields.startTime)
      : existing.recurrenceAnchor

  const row = await prisma.calendarObject.update({
    where: { id },
    data: {
      ...fields,
      ...(input.colour !== undefined && { colour: input.colour }),
      etag,
      icalRaw,
      recurrenceType,
      ...(recurrenceType
        ? {
            intervalDays:
              input.intervalDays !== undefined ? input.intervalDays : existing.intervalDays,
            weekdays: input.weekdays !== undefined ? input.weekdays : existing.weekdays,
            dayOfMonth: input.dayOfMonth !== undefined ? input.dayOfMonth : existing.dayOfMonth,
            recurrenceAnchor,
          }
        : { intervalDays: null, weekdays: [], dayOfMonth: null, recurrenceAnchor: null }),
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

const ROLL_HORIZON_DAYS = 14

/** `base`'s time-of-day transplanted onto `day`'s calendar date. */
function withDay(base: Date, day: Date): Date {
  const out = new Date(base)
  out.setFullYear(day.getFullYear(), day.getMonth(), day.getDate())
  return out
}

/**
 * A repeating event has one CalDAV resource, so a phone can only ever be shown
 * a single occurrence of it. This rolls that occurrence forward once it's
 * passed and the next one falls within the next two weeks, keeping the
 * `.ics` "fresh enough" for DAVx5 without emitting RRULE. Piggybacked on the
 * existing `CALENDAR_SYNC_CRON` tick rather than a dedicated nightly job — a
 * strict superset of "nightly", and this is a cheap in-memory pass with no
 * outbound calls. Hame's own dashboard/calendar/idle screens never read this
 * cache — they expand every occurrence live from `recurrenceAnchor`
 * (see calendar.service.ts), so this only affects what a phone sees.
 */
export async function rollRecurringCalendarEvents(now: Date = new Date()): Promise<void> {
  const rows = await prisma.calendarObject.findMany({ where: { recurrenceType: { not: null } } })
  const horizon = addDays(now, ROLL_HORIZON_DAYS)

  for (const row of rows) {
    if (!row.recurrenceType || row.recurrenceType === 'ONE_OFF' || !row.recurrenceAnchor) continue

    const rule: BinScheduleRule = {
      recurrenceType: row.recurrenceType,
      intervalDays: row.intervalDays,
      weekdays: row.weekdays,
      dayOfMonth: row.dayOfMonth,
      startDate: row.recurrenceAnchor,
    }
    const next = nextBinCollection(rule, now)
    if (!next || next > horizon || isSameDay(next, row.startTime)) continue

    const startTime = withDay(row.startTime, next)
    const endTime = row.endTime ? withDay(row.endTime, next) : null
    const { icalRaw, etag } = renderIcal(row.uid, {
      title: row.title,
      description: row.description,
      startTime,
      endTime,
      allDay: row.allDay,
    })
    await prisma.calendarObject.update({
      where: { id: row.id },
      data: { startTime, endTime, icalRaw, etag },
    })
  }
}
