import { describe, it, expect, vi, beforeEach } from 'vitest'

const choreCreate = vi.fn()
const choreFindUnique = vi.fn()
const choreDelete = vi.fn()
const instanceCreate = vi.fn()
const instanceFindUnique = vi.fn()
const userCount = vi.fn()
const userFindUnique = vi.fn()
const petCount = vi.fn()
const tagCount = vi.fn()
const transaction = vi.fn()
const txInstanceCreate = vi.fn()
const txInstanceUpdate = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    chore: { create: choreCreate, findUnique: choreFindUnique, delete: choreDelete },
    choreInstance: { create: instanceCreate, findUnique: instanceFindUnique },
    user: { count: userCount, findUnique: userFindUnique },
    pet: { count: petCount },
    tag: { count: tagCount },
    $transaction: transaction,
  },
}))

const { createChore, completeInstance } = await import('../services/chore.service.js')

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
    choreDelete,
    instanceCreate,
    instanceFindUnique,
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
