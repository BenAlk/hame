import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const count = vi.fn()
const del = vi.fn()
const update = vi.fn()
const updateMany = vi.fn()
const transaction = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique, count, delete: del, update },
    item: { updateMany },
    shoppingList: { updateMany },
    shoppingListItem: { updateMany },
    pantryEntry: { updateMany },
    chore: { updateMany },
    choreInstance: { updateMany },
    $transaction: transaction,
  },
}))

const { deleteUser, adminUpdateUser } = await import('../services/user.service.js')

const admin = { id: 'a1', role: 'ADMIN' as const }
const member = { id: 'm1', role: 'MEMBER' as const }

beforeEach(() => {
  for (const fn of [findUnique, count, del, update, updateMany, transaction]) fn.mockReset()
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
})
