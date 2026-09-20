import { describe, it, expect, vi, beforeEach } from 'vitest'

const choreCreate = vi.fn()
const choreFindUnique = vi.fn()
const choreFindUniqueOrThrow = vi.fn()
const choreUpdate = vi.fn()
const choreDelete = vi.fn()
const instanceCreate = vi.fn()
const instanceFindUnique = vi.fn()
const instanceFindMany = vi.fn()
const instanceFindFirst = vi.fn()
const instanceUpdate = vi.fn()
const instanceDeleteMany = vi.fn()
const userCount = vi.fn()
const userFindUnique = vi.fn()
const petCount = vi.fn()
const tagCount = vi.fn()
const transaction = vi.fn()
const txInstanceCreate = vi.fn()
const txInstanceUpdate = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    chore: {
      create: choreCreate,
      findUnique: choreFindUnique,
      findUniqueOrThrow: choreFindUniqueOrThrow,
      update: choreUpdate,
      delete: choreDelete,
    },
    choreInstance: {
      create: instanceCreate,
      findUnique: instanceFindUnique,
      findMany: instanceFindMany,
      findFirst: instanceFindFirst,
      update: instanceUpdate,
      deleteMany: instanceDeleteMany,
    },
    user: { count: userCount, findUnique: userFindUnique },
    pet: { count: petCount },
    tag: { count: tagCount },
    $transaction: transaction,
  },
}))

const { createChore, updateChore, completeInstance } = await import('../services/chore.service.js')

const day = (y: number, m: number, d: number) => new Date(y, m, d)

/** A complete chore row shaped for `getChore`'s include → `toChore`. */
const fullChoreRow = {
  id: 'c1',
  title: 'Worming',
  description: null,
  recurrenceType: 'INTERVAL' as const,
  intervalDays: 30,
  weekdays: [],
  dayOfMonth: null,
  oneOffDate: null,
  assignmentMode: 'FIXED' as const,
  assignedTo: { id: 'u1', firstName: 'Ben', colour: '#000' },
  rotatingUsers: [],
  pet: null,
  tags: [],
  isActive: true,
  createdById: 'u1',
  instances: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  for (const fn of [
    choreCreate,
    choreFindUnique,
    choreFindUniqueOrThrow,
    choreUpdate,
    choreDelete,
    instanceCreate,
    instanceFindUnique,
    instanceFindMany,
    instanceFindFirst,
    instanceUpdate,
    instanceDeleteMany,
    userCount,
    userFindUnique,
    petCount,
    tagCount,
    transaction,
    txInstanceCreate,
    txInstanceUpdate,
  ]) {
    fn.mockReset()
  }
  choreFindUnique.mockResolvedValue(fullChoreRow)
  choreUpdate.mockResolvedValue(fullChoreRow)
  // By default the completer is a real household member.
  userFindUnique.mockResolvedValue({ role: 'MEMBER' })
  transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ choreInstance: { create: txInstanceCreate, update: txInstanceUpdate } }),
  )
})

describe('createChore', () => {
  it('opens a first instance for the fixed assignee, due today', async () => {
    userCount.mockResolvedValue(1)
    choreCreate.mockResolvedValue({ id: 'c1' })

    await createChore(
      {
        title: 'Worming',
        recurrenceType: 'INTERVAL',
        intervalDays: 30,
        assignmentMode: 'FIXED',
        assignedToId: 'u1',
      },
      'u1',
    )

    expect(instanceCreate).toHaveBeenCalledTimes(1)
    const data = instanceCreate.mock.calls[0][0].data
    expect(data.choreId).toBe('c1')
    expect(data.assignedToId).toBe('u1')
    expect(new Date(data.dueDate).toDateString()).toBe(new Date().toDateString())
  })

  it('rejects an unknown assignee before writing anything', async () => {
    userCount.mockResolvedValue(0) // referenced user not found
    await expect(
      createChore(
        {
          title: 'X',
          recurrenceType: 'INTERVAL',
          intervalDays: 1,
          assignmentMode: 'FIXED',
          assignedToId: 'ghost',
        },
        'u1',
      ),
    ).rejects.toMatchObject({ status: 400 })
    expect(choreCreate).not.toHaveBeenCalled()
  })
})

describe('updateChore', () => {
  /** The row `updateChore` reads before writing — a FIXED, active, INTERVAL chore. */
  const existingRow = {
    id: 'c1',
    title: 'Worming',
    isActive: true,
    recurrenceType: 'INTERVAL' as const,
    intervalDays: 30,
    weekdays: [] as const,
    dayOfMonth: null,
    oneOffDate: null,
    assignmentMode: 'FIXED' as const,
    assignedToId: 'u1',
    rotatingUsers: [] as { id: string }[],
  }

  /** The full field set `ChoreForm` always submits, unmodified from `existingRow`. */
  const unchangedFields = {
    recurrenceType: 'INTERVAL' as const,
    intervalDays: 30,
    weekdays: [],
    dayOfMonth: null,
    oneOffDate: null,
    assignmentMode: 'FIXED' as const,
    assignedToId: 'u1',
    rotatingUsers: [],
    petId: null,
  }

  beforeEach(() => {
    // `updateChore`'s own `existing` fetch (call #1) is queued per-test below;
    // the outer `beforeEach`'s persistent `fullChoreRow` fallback answers the
    // later `getChore` call (call #2), which needs the fully-joined shape.
    choreFindUniqueOrThrow.mockResolvedValue({ ...existingRow, rotatingUsers: [] })
    userCount.mockResolvedValue(1)
  })

  it('leaves the open instance untouched on a title-only edit', async () => {
    choreFindUnique.mockResolvedValueOnce(existingRow)
    await updateChore('c1', { title: 'New title', ...unchangedFields })

    expect(choreUpdate).toHaveBeenCalledTimes(1)
    expect(choreFindUniqueOrThrow).not.toHaveBeenCalled()
    expect(instanceFindMany).not.toHaveBeenCalled()
    expect(instanceFindFirst).not.toHaveBeenCalled()
    expect(instanceUpdate).not.toHaveBeenCalled()
    expect(instanceCreate).not.toHaveBeenCalled()
    expect(instanceDeleteMany).not.toHaveBeenCalled()
  })

  it('reassigning preserves the due date and only updates the assignee', async () => {
    choreFindUnique.mockResolvedValueOnce(existingRow)
    instanceFindFirst.mockResolvedValue({ id: 'i1', assignedToId: 'u1', dueDate: day(2026, 5, 1) })
    choreFindUniqueOrThrow.mockResolvedValue({
      ...existingRow,
      assignedToId: 'u2',
      rotatingUsers: [],
    })

    await updateChore('c1', { ...unchangedFields, assignedToId: 'u2' })

    expect(instanceFindMany).not.toHaveBeenCalled() // reconcileOpenInstance's path, not taken
    expect(instanceFindFirst).toHaveBeenCalledTimes(1)
    expect(instanceUpdate).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { assignedToId: 'u2' },
    })
  })

  it('shifts the due date by the change in cadence, rather than making it due today', async () => {
    choreFindUnique.mockResolvedValueOnce(existingRow) // intervalDays: 30
    choreFindUniqueOrThrow.mockResolvedValue({
      ...existingRow,
      intervalDays: 28,
      rotatingUsers: [],
    })
    instanceFindMany.mockResolvedValue([{ id: 'i1', dueDate: day(2026, 5, 1) }]) // 1 Jun 2026

    await updateChore('c1', { ...unchangedFields, intervalDays: 28 }) // 30 -> 28 days

    expect(instanceFindFirst).not.toHaveBeenCalled() // reassignOpenInstance's path, not taken
    expect(instanceFindMany).toHaveBeenCalledTimes(1)
    expect(instanceUpdate).toHaveBeenCalledTimes(1)
    const data = instanceUpdate.mock.calls[0][0].data
    // 2 days earlier than the old due date — not reset to today.
    expect(new Date(data.dueDate).toDateString()).toBe(day(2026, 4, 30).toDateString())
  })

  it('recomputes the due date from today when the rule type itself changes', async () => {
    choreFindUnique.mockResolvedValueOnce(existingRow)
    choreFindUniqueOrThrow.mockResolvedValue({
      ...existingRow,
      recurrenceType: 'DATE_OF_MONTH',
      intervalDays: null,
      dayOfMonth: 15,
      rotatingUsers: [],
    })
    instanceFindMany.mockResolvedValue([{ id: 'i1', dueDate: day(2026, 5, 1) }])

    await updateChore('c1', {
      ...unchangedFields,
      recurrenceType: 'DATE_OF_MONTH',
      intervalDays: null,
      dayOfMonth: 15,
    })

    expect(instanceUpdate).toHaveBeenCalledTimes(1)
    const data = instanceUpdate.mock.calls[0][0].data
    expect(new Date(data.dueDate).toDateString()).not.toBe(day(2026, 5, 1).toDateString())
  })

  it('reactivating a chore opens a fresh instance even with an unchanged rule', async () => {
    choreFindUnique.mockResolvedValueOnce({ ...existingRow, isActive: false })
    choreFindUniqueOrThrow.mockResolvedValue({ ...existingRow, isActive: true, rotatingUsers: [] })
    instanceFindMany.mockResolvedValue([])

    await updateChore('c1', { ...unchangedFields, isActive: true })

    expect(instanceCreate).toHaveBeenCalledTimes(1)
    expect(instanceCreate.mock.calls[0][0].data.choreId).toBe('c1')
  })

  it('deactivating a chore removes its open instances without reconciling', async () => {
    choreFindUnique.mockResolvedValueOnce(existingRow)
    await updateChore('c1', { ...unchangedFields, isActive: false })

    expect(instanceDeleteMany).toHaveBeenCalledWith({
      where: { choreId: 'c1', completedAt: null },
    })
    expect(choreFindUniqueOrThrow).not.toHaveBeenCalled()
  })
})

describe('completeInstance', () => {
  const rotatingInstance = {
    id: 'i1',
    choreId: 'c1',
    assignedToId: 'u1',
    dueDate: day(2026, 5, 1),
    completedAt: null,
    chore: {
      id: 'c1',
      isActive: true,
      recurrenceType: 'INTERVAL',
      intervalDays: 3,
      weekdays: [],
      dayOfMonth: null,
      oneOffDate: null,
      assignmentMode: 'ROTATING',
      assignedToId: null,
      rotatingUsers: [{ id: 'u1' }, { id: 'u2' }],
    },
  }

  it('completes and generates the next instance with rotation advanced', async () => {
    instanceFindUnique.mockResolvedValue(rotatingInstance)

    await completeInstance('i1', { completedAt: day(2026, 5, 5) }, 'u1')

    expect(txInstanceUpdate).toHaveBeenCalledTimes(1)
    expect(txInstanceCreate).toHaveBeenCalledTimes(1)
    const next = txInstanceCreate.mock.calls[0][0].data
    expect(next.assignedToId).toBe('u2') // advanced from u1
    expect(new Date(next.dueDate)).toEqual(day(2026, 5, 8)) // 5 Jun + 3 days
  })

  it('does not generate a follow-up for a ONE_OFF chore', async () => {
    instanceFindUnique.mockResolvedValue({
      ...rotatingInstance,
      chore: {
        ...rotatingInstance.chore,
        recurrenceType: 'ONE_OFF',
        assignmentMode: 'FIXED',
        assignedToId: 'u1',
      },
    })

    await completeInstance('i1', {}, 'u1')

    expect(txInstanceUpdate).toHaveBeenCalledTimes(1)
    expect(txInstanceCreate).not.toHaveBeenCalled()
  })

  it('rejects completing an already-completed instance', async () => {
    instanceFindUnique.mockResolvedValue({ ...rotatingInstance, completedAt: day(2026, 5, 2) })
    await expect(completeInstance('i1', {}, 'u1')).rejects.toMatchObject({ status: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('credits an explicit completer (picked at the wall tablet) rather than the caller', async () => {
    instanceFindUnique.mockResolvedValue(rotatingInstance)
    userFindUnique.mockResolvedValue({ role: 'MEMBER' }) // the picked member is a person

    // Caller is the tablet ('t1'); the picked member is 'u2'.
    await completeInstance('i1', { completedById: 'u2' }, 't1')

    expect(userFindUnique).toHaveBeenCalledWith({ where: { id: 'u2' }, select: { role: true } })
    expect(txInstanceUpdate.mock.calls[0][0].data.completedById).toBe('u2')
  })

  it('rejects a completion credited to a non-person (e.g. the tablet itself)', async () => {
    instanceFindUnique.mockResolvedValue(rotatingInstance)
    userFindUnique.mockResolvedValue({ role: 'TABLET' }) // caller is the tablet, no member picked
    await expect(completeInstance('i1', {}, 't1')).rejects.toMatchObject({ status: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects a completedById that doesn’t resolve to a user', async () => {
    instanceFindUnique.mockResolvedValue(rotatingInstance)
    userFindUnique.mockResolvedValue(null)
    await expect(completeInstance('i1', { completedById: 'ghost' }, 'u1')).rejects.toMatchObject({
      status: 400,
    })
    expect(transaction).not.toHaveBeenCalled()
  })
})
