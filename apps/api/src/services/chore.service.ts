import type { Prisma } from '@prisma/client'
import type {
  Chore,
  ChoreInstance,
  CompleteInstanceInput,
  CreateChoreInput,
  UpdateChoreInput,
} from '@hame/shared'
import { firstDueDate, nextDueDate } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { toTag } from './tag.service.js'
import { toMemberSummary } from './user.service.js'

const memberSelect = { select: { id: true, firstName: true, colour: true } } as const

export const instanceInclude = {
  chore: { select: { id: true, title: true, petId: true } },
  assignedTo: memberSelect,
  completedBy: memberSelect,
} as const satisfies Prisma.ChoreInstanceInclude

// Rotation order is read consistently by member creation date — stable across
// reads, so the cycle is deterministic (see `nextAssignee`).
const choreInclude = {
  assignedTo: memberSelect,
  rotatingUsers: { ...memberSelect, orderBy: { createdAt: 'asc' } },
  pet: { select: { id: true, name: true, species: true } },
  tags: { orderBy: { name: 'asc' } },
  instances: {
    where: { completedAt: null },
    include: instanceInclude,
    orderBy: { dueDate: 'asc' },
    take: 1,
  },
} as const satisfies Prisma.ChoreInclude

type InstanceRow = Prisma.ChoreInstanceGetPayload<{ include: typeof instanceInclude }>
type ChoreRow = Prisma.ChoreGetPayload<{ include: typeof choreInclude }>

export function toChoreInstance(row: InstanceRow): ChoreInstance {
  return {
    id: row.id,
    choreId: row.choreId,
    chore: { id: row.chore.id, title: row.chore.title, petId: row.chore.petId },
    assignedTo: toMemberSummary(row.assignedTo),
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    completedBy: row.completedBy ? toMemberSummary(row.completedBy) : null,
    notes: row.notes,
    createdAt: row.createdAt,
  }
}

function toChore(row: ChoreRow): Chore {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    recurrenceType: row.recurrenceType,
    intervalDays: row.intervalDays,
    weekdays: row.weekdays,
    dayOfMonth: row.dayOfMonth,
    oneOffDate: row.oneOffDate,
    assignmentMode: row.assignmentMode,
    assignedTo: row.assignedTo ? toMemberSummary(row.assignedTo) : null,
    rotatingUsers: row.rotatingUsers.map(toMemberSummary),
    pet: row.pet,
    tags: row.tags.map(toTag),
    isActive: row.isActive,
    createdById: row.createdById,
    openInstance: row.instances[0] ? toChoreInstance(row.instances[0]) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** The recurrence subset the engine needs, lifted from a chore row or input. */
function ruleOf(c: {
  recurrenceType: Chore['recurrenceType']
  intervalDays?: number | null
  weekdays?: Chore['weekdays'] | null
  dayOfMonth?: number | null
  oneOffDate?: Date | null
}) {
  return {
    recurrenceType: c.recurrenceType,
    intervalDays: c.intervalDays,
    weekdays: c.weekdays,
    dayOfMonth: c.dayOfMonth,
    oneOffDate: c.oneOffDate,
  }
}

/** Who the opening instance goes to: rotation starts at the first member. */
function firstAssignee(
  mode: Chore['assignmentMode'],
  assignedToId: string | null | undefined,
  rotatingUserIds: string[],
): string | null {
  return mode === 'ROTATING' ? (rotatingUserIds[0] ?? null) : (assignedToId ?? null)
}

/** Advance one step round the rotation from whoever held the last instance. */
function nextAssignee(rotatingUserIds: string[], previousAssigneeId: string): string {
  const idx = rotatingUserIds.indexOf(previousAssigneeId)
  return rotatingUserIds[(idx + 1) % rotatingUserIds.length] ?? rotatingUserIds[0]
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listChores(opts: { active?: boolean } = {}): Promise<Chore[]> {
  const chores = await prisma.chore.findMany({
    where: opts.active === undefined ? undefined : { isActive: opts.active },
    include: choreInclude,
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  })
  return chores.map(toChore)
}

export async function getChore(id: string): Promise<Chore> {
  const chore = await prisma.chore.findUnique({ where: { id }, include: choreInclude })
  if (!chore) throw HttpError.notFound('Chore not found')
  return toChore(chore)
}

/**
 * Instances for the calendar / dashboard. `due: 'today'` returns open instances
 * due today or earlier (overdue + due) — what the "Today's chores" widget shows.
 */
export async function listChoreInstances(
  opts: {
    from?: Date
    to?: Date
    due?: 'today'
    petId?: string
  } = {},
): Promise<ChoreInstance[]> {
  const where: Prisma.ChoreInstanceWhereInput = {}
  if (opts.due === 'today') {
    where.completedAt = null
    where.dueDate = { lte: endOfToday() }
  }
  if (opts.from || opts.to) {
    where.dueDate = { ...(opts.from && { gte: opts.from }), ...(opts.to && { lte: opts.to }) }
  }
  if (opts.petId) where.chore = { petId: opts.petId }

  const rows = await prisma.choreInstance.findMany({
    where,
    include: instanceInclude,
    orderBy: { dueDate: 'asc' },
  })
  return rows.map(toChoreInstance)
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createChore(input: CreateChoreInput, userId: string): Promise<Chore> {
  await assertReferencesExist(input)

  const rotatingIds = input.assignmentMode === 'ROTATING' ? (input.rotatingUsers ?? []) : []
  const chore = await prisma.chore.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      recurrenceType: input.recurrenceType,
      intervalDays: input.intervalDays ?? null,
      weekdays: input.weekdays ?? [],
      dayOfMonth: input.dayOfMonth ?? null,
      oneOffDate: input.oneOffDate ?? null,
      assignmentMode: input.assignmentMode,
      assignedToId: input.assignmentMode === 'FIXED' ? (input.assignedToId ?? null) : null,
      petId: input.petId ?? null,
      createdById: userId,
      ...(rotatingIds.length > 0 && {
        rotatingUsers: { connect: rotatingIds.map((id) => ({ id })) },
      }),
      ...(input.tagIds && { tags: { connect: input.tagIds.map((id) => ({ id })) } }),
    },
  })

  // Open the first occurrence (chores are active on creation).
  const dueDate = firstDueDate(ruleOf(input))
  const assigneeId = firstAssignee(input.assignmentMode, input.assignedToId, rotatingIds)
  if (dueDate && assigneeId) {
    await prisma.choreInstance.create({
      data: { choreId: chore.id, assignedToId: assigneeId, dueDate },
    })
  }

  return getChore(chore.id)
}

export async function updateChore(id: string, input: UpdateChoreInput): Promise<Chore> {
  const existing = await prisma.chore.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Chore not found')
  await assertReferencesExist(input)

  const rotatingIds = input.rotatingUsers
  await prisma.chore.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.recurrenceType !== undefined && { recurrenceType: input.recurrenceType }),
      ...(input.intervalDays !== undefined && { intervalDays: input.intervalDays }),
      ...(input.weekdays !== undefined && { weekdays: input.weekdays }),
      ...(input.dayOfMonth !== undefined && { dayOfMonth: input.dayOfMonth }),
      ...(input.oneOffDate !== undefined && { oneOffDate: input.oneOffDate }),
      ...(input.assignmentMode !== undefined && { assignmentMode: input.assignmentMode }),
      ...(input.assignedToId !== undefined && { assignedToId: input.assignedToId }),
      ...(input.petId !== undefined && { petId: input.petId }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(rotatingIds && { rotatingUsers: { set: rotatingIds.map((uid) => ({ id: uid })) } }),
      ...(input.tagIds && { tags: { set: input.tagIds.map((tid) => ({ id: tid })) } }),
    },
  })

  // Re-derive the open instance when scheduling or assignment changed.
  if (touchesSchedule(input)) await reconcileOpenInstance(id)
  return getChore(id)
}

export async function deleteChore(id: string): Promise<void> {
  const existing = await prisma.chore.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Chore not found')
  await prisma.chore.delete({ where: { id } }) // instances cascade-delete
}

/**
 * Mark an instance complete and, for recurring chores, open the next one
 * (rotation advanced). The whole step is transactional so history and the
 * follow-up instance commit together.
 */
export async function completeInstance(
  instanceId: string,
  input: CompleteInstanceInput,
  userId: string,
): Promise<Chore> {
  const instance = await prisma.choreInstance.findUnique({
    where: { id: instanceId },
    include: { chore: { include: { rotatingUsers: { orderBy: { createdAt: 'asc' } } } } },
  })
  if (!instance) throw HttpError.notFound('Chore instance not found')
  if (instance.completedAt) throw HttpError.badRequest('This chore is already completed')

  const { chore } = instance
  const completedAt = input.completedAt ?? new Date()
  const next = chore.isActive
    ? nextDueDate(ruleOf(chore), { dueDate: instance.dueDate, completedAt })
    : null

  await prisma.$transaction(async (tx) => {
    await tx.choreInstance.update({
      where: { id: instanceId },
      data: {
        completedAt,
        completedById: userId,
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    })

    if (next) {
      const rotatingIds = chore.rotatingUsers.map((u) => u.id)
      const assigneeId =
        chore.assignmentMode === 'ROTATING'
          ? nextAssignee(rotatingIds, instance.assignedToId)
          : (chore.assignedToId ?? instance.assignedToId)
      await tx.choreInstance.create({
        data: { choreId: chore.id, assignedToId: assigneeId, dueDate: next },
      })
    }
  })

  return getChore(chore.id)
}

/** Undo a completion (misclick): reopen this instance, drop the follow-up. */
export async function uncompleteInstance(instanceId: string): Promise<Chore> {
  const instance = await prisma.choreInstance.findUnique({ where: { id: instanceId } })
  if (!instance) throw HttpError.notFound('Chore instance not found')
  if (!instance.completedAt) throw HttpError.badRequest('This chore is not completed')

  await prisma.$transaction(async (tx) => {
    // Remove the follow-up(s) this completion generated, then reopen the instance.
    await tx.choreInstance.deleteMany({
      where: { choreId: instance.choreId, completedAt: null, id: { not: instanceId } },
    })
    await tx.choreInstance.update({
      where: { id: instanceId },
      data: { completedAt: null, completedById: null },
    })
  })

  return getChore(instance.choreId)
}

// ── internals ──────────────────────────────────────────────────────────────

function endOfToday(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

/** Did this update touch anything that changes when/who the next instance is? */
function touchesSchedule(input: UpdateChoreInput): boolean {
  return [
    input.recurrenceType,
    input.intervalDays,
    input.weekdays,
    input.dayOfMonth,
    input.oneOffDate,
    input.assignmentMode,
    input.assignedToId,
    input.rotatingUsers,
    input.isActive,
  ].some((v) => v !== undefined)
}

/**
 * Keep exactly one open instance in sync with the chore's current rule: inactive
 * chores have none; active chores have one matching the recomputed due/assignee.
 */
async function reconcileOpenInstance(choreId: string): Promise<void> {
  const chore = await prisma.chore.findUniqueOrThrow({
    where: { id: choreId },
    include: { rotatingUsers: { orderBy: { createdAt: 'asc' } } },
  })
  const open = await prisma.choreInstance.findMany({
    where: { choreId, completedAt: null },
    orderBy: { dueDate: 'asc' },
  })

  if (!chore.isActive) {
    if (open.length > 0)
      await prisma.choreInstance.deleteMany({ where: { id: { in: open.map((i) => i.id) } } })
    return
  }

  const dueDate = firstDueDate(ruleOf(chore))
  const rotatingIds = chore.rotatingUsers.map((u) => u.id)
  const assigneeId = firstAssignee(chore.assignmentMode, chore.assignedToId, rotatingIds)
  if (!dueDate || !assigneeId) return

  if (open.length === 0) {
    await prisma.choreInstance.create({ data: { choreId, assignedToId: assigneeId, dueDate } })
    return
  }
  // Update the earliest open instance, discard any accidental extras.
  await prisma.choreInstance.update({
    where: { id: open[0].id },
    data: { dueDate, assignedToId: assigneeId },
  })
  if (open.length > 1)
    await prisma.choreInstance.deleteMany({ where: { id: { in: open.slice(1).map((i) => i.id) } } })
}

/** Validate every referenced user / pet / tag exists before writing. */
async function assertReferencesExist(input: CreateChoreInput | UpdateChoreInput): Promise<void> {
  const userIds = new Set<string>()
  if (input.assignedToId) userIds.add(input.assignedToId)
  for (const id of input.rotatingUsers ?? []) userIds.add(id)
  if (userIds.size > 0) {
    const found = await prisma.user.count({ where: { id: { in: [...userIds] } } })
    if (found !== userIds.size) throw HttpError.badRequest('Unknown assigned user')
  }
  if (input.petId) {
    const pet = await prisma.pet.count({ where: { id: input.petId } })
    if (pet === 0) throw HttpError.badRequest('Unknown pet')
  }
  if (input.tagIds && input.tagIds.length > 0) {
    const found = await prisma.tag.count({ where: { id: { in: input.tagIds } } })
    if (found !== input.tagIds.length) throw HttpError.badRequest('Unknown tag')
  }
}
