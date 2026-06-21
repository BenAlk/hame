import type { Prisma } from '@prisma/client'
import type { CreateCustomEventInput, CustomEvent, UpdateCustomEventInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { toMemberSummary } from './user.service.js'

const eventInclude = {
  createdBy: { select: { id: true, firstName: true, colour: true } },
} as const satisfies Prisma.CustomEventInclude

type EventRow = Prisma.CustomEventGetPayload<{ include: typeof eventInclude }>

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

/** Custom events overlapping a date window (events that start before `to` and end after `from`). */
export async function listCustomEvents(
  opts: { from?: Date; to?: Date } = {},
): Promise<CustomEvent[]> {
  const where: Prisma.CustomEventWhereInput = {}
  if (opts.to) where.startTime = { lte: opts.to }
  if (opts.from) {
    // Keep events whose end (or start, when open-ended) falls on/after the window start.
    where.OR = [{ endTime: { gte: opts.from } }, { endTime: null, startTime: { gte: opts.from } }]
  }
  const rows = await prisma.customEvent.findMany({
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
  const row = await prisma.customEvent.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      startTime: input.startTime,
      endTime: input.endTime ?? null,
      allDay: input.allDay ?? false,
      colour: input.colour ?? null,
      createdById: userId,
    },
    include: eventInclude,
  })
  return toCustomEvent(row)
}

export async function updateCustomEvent(
  id: string,
  input: UpdateCustomEventInput,
): Promise<CustomEvent> {
  const existing = await prisma.customEvent.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Event not found')
  const row = await prisma.customEvent.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.startTime !== undefined && { startTime: input.startTime }),
      ...(input.endTime !== undefined && { endTime: input.endTime }),
      ...(input.allDay !== undefined && { allDay: input.allDay }),
      ...(input.colour !== undefined && { colour: input.colour }),
    },
    include: eventInclude,
  })
  return toCustomEvent(row)
}

export async function deleteCustomEvent(id: string): Promise<void> {
  const existing = await prisma.customEvent.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Event not found')
  await prisma.customEvent.delete({ where: { id } })
}
