import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PERSON_ROLES, TABLET_FALLBACK_LABEL } from '@hame/shared'

const findUnique = vi.fn()
const findFirst = vi.fn()
const findMany = vi.fn()
const create = vi.fn()
const count = vi.fn()
const del = vi.fn()
const update = vi.fn()
const updateMany = vi.fn()
const transaction = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique, findFirst, findMany, create, count, delete: del, update },
    item: { updateMany },
    shoppingList: { updateMany },
    shoppingListItem: { updateMany },
    pantryEntry: { updateMany },
    chore: { updateMany },
    choreInstance: { updateMany },
    $transaction: transaction,
  },
}))

const {
  deleteUser,
  adminUpdateUser,
  createTabletAccount,
  resetTabletPassword,
  getTabletAccount,
  listMembers,
  listUsers,
  setTabletName,
  toMemberSummary,
} = await import('../services/user.service.js')

const admin = { id: 'a1', role: 'ADMIN' as const }
const member = { id: 'm1', role: 'MEMBER' as const }
const READABLE_PW = /^[a-z2-9]{5}-[a-z2-9]{5}-[a-z2-9]{5}-[a-z2-9]{5}$/

beforeEach(() => {
  for (const fn of [
    findUnique,
    findFirst,
    findMany,
    create,
    count,
    del,
    update,
    updateMany,
    transaction,
  ])
    fn.mockReset()
  transaction.mockResolvedValue([])
})

describe('deleteUser guards', () => {
  it('refuses to delete your own account', async () => {
    await expect(deleteUser('a1', 'a1')).rejects.toMatchObject({ status: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('refuses to delete the last admin', async () => {
    findUnique.mockResolvedValue(admin)
    count.mockResolvedValue(1)
    await expect(deleteUser('a1', 'a2')).rejects.toMatchObject({ status: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('reassigns the member’s records to the acting admin, then deletes', async () => {
    findUnique.mockResolvedValue(member)
    await deleteUser('a1', 'm1')

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith({ where: { id: 'm1' } })
    // created/assigned records move to the acting admin (a1)
    expect(updateMany).toHaveBeenCalledWith({
      where: { createdById: 'm1' },
      data: { createdById: 'a1' },
    })
    expect(updateMany).toHaveBeenCalledWith({
      where: { assignedToId: 'm1' },
      data: { assignedToId: 'a1' },
    })
    // dropped from chore rotations
    expect(update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { choresRotation: { set: [] } },
    })
  })
})

describe('adminUpdateUser guards', () => {
  it('refuses to demote the last admin', async () => {
    findUnique.mockResolvedValue(admin)
    count.mockResolvedValue(1)
    await expect(adminUpdateUser('a1', { role: 'MEMBER' })).rejects.toMatchObject({ status: 400 })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses to mutate the tablet account via the generic person endpoint', async () => {
    findUnique.mockResolvedValue({ id: 't1', role: 'TABLET' })
    await expect(adminUpdateUser('t1', { role: 'ADMIN' })).rejects.toMatchObject({ status: 400 })
    expect(update).not.toHaveBeenCalled()
  })
})

describe('tablet account provisioning (spec §8.1)', () => {
  it('creates the tablet with role TABLET and returns a one-time readable password', async () => {
    findFirst.mockResolvedValue(null) // none provisioned yet
    findUnique.mockResolvedValue(null) // username free
    create.mockResolvedValue({ id: 't1', username: 'tablet', role: 'TABLET' })

    const creds = await createTabletAccount()

    expect(create.mock.calls[0][0].data.role).toBe('TABLET')
    expect(create.mock.calls[0][0].data.username).toBe('tablet')
    expect(creds.username).toBe('tablet')
    expect(creds.password).toMatch(READABLE_PW)
  })

  it('refuses to create a second tablet account (409)', async () => {
    findFirst.mockResolvedValue({ id: 't1', role: 'TABLET' })
    await expect(createTabletAccount()).rejects.toMatchObject({ status: 409 })
    expect(create).not.toHaveBeenCalled()
  })

  it('resets the tablet password, bumping tokenVersion to revoke sessions', async () => {
    findFirst.mockResolvedValue({ id: 't1', username: 'tablet', role: 'TABLET' })
    update.mockResolvedValue({})

    const creds = await resetTabletPassword()

    expect(creds).toMatchObject({ username: 'tablet' })
    expect(creds.password).toMatch(READABLE_PW)
    expect(update.mock.calls[0][0].data.tokenVersion).toEqual({ increment: 1 })
  })

  it('reset 404s when no tablet account exists', async () => {
    findFirst.mockResolvedValue(null)
    await expect(resetTabletPassword()).rejects.toMatchObject({ status: 404 })
  })

  it('getTabletAccount returns null when none provisioned', async () => {
    findFirst.mockResolvedValue(null)
    expect(await getTabletAccount()).toBeNull()
  })

  it('provisions the tablet unnamed, so the greeting omits a name', async () => {
    findFirst.mockResolvedValue(null)
    findUnique.mockResolvedValue(null)
    create.mockResolvedValue({ id: 't1', username: 'tablet', role: 'TABLET' })

    await createTabletAccount()

    expect(create.mock.calls[0][0].data.firstName).toBe('')
  })
})

describe('naming the wall tablet (spec §8.1)', () => {
  it('stores a trimmed name as the account first name', async () => {
    findFirst.mockResolvedValue({ id: 't1', role: 'TABLET' })
    update.mockResolvedValue({ id: 't1', firstName: 'Kitchen', password: 'hash' })

    const account = await setTabletName('  Kitchen  ')

    expect(update.mock.calls[0][0].data).toEqual({ firstName: 'Kitchen' })
    expect(account.firstName).toBe('Kitchen')
    expect(account).not.toHaveProperty('password')
  })

  it('clears the name when given an empty string', async () => {
    findFirst.mockResolvedValue({ id: 't1', role: 'TABLET' })
    update.mockResolvedValue({ id: 't1', firstName: '', password: 'hash' })

    await setTabletName('')

    expect(update.mock.calls[0][0].data).toEqual({ firstName: '' })
  })

  it('404s when no tablet account exists', async () => {
    findFirst.mockResolvedValue(null)
    await expect(setTabletName('Kitchen')).rejects.toMatchObject({ status: 404 })
    expect(update).not.toHaveBeenCalled()
  })
})

describe('attribution for a nameless tablet', () => {
  it('labels a blank name rather than crediting nobody', () => {
    expect(toMemberSummary({ id: 't1', firstName: '', colour: '#857a6c' })).toEqual({
      id: 't1',
      firstName: TABLET_FALLBACK_LABEL,
      colour: '#857a6c',
    })
  })

  it('leaves a real name alone', () => {
    expect(toMemberSummary({ id: 'm1', firstName: 'Alex', colour: '#3B82F6' }).firstName).toBe(
      'Alex',
    )
  })
})

describe('the tablet is excluded from people-lists', () => {
  const personWhere = { role: { in: [...PERSON_ROLES] } }

  it('listMembers filters to person roles only', async () => {
    findMany.mockResolvedValue([])
    await listMembers()
    expect(findMany.mock.calls[0][0].where).toEqual(personWhere)
  })

  it('listUsers filters to person roles only', async () => {
    findMany.mockResolvedValue([])
    await listUsers()
    expect(findMany.mock.calls[0][0].where).toEqual(personWhere)
  })
})
