import { describe, it, expect, vi, beforeEach } from 'vitest'

const petFindUnique = vi.fn()
const petDelete = vi.fn()
const instanceFindMany = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    pet: { findUnique: petFindUnique, delete: petDelete },
    choreInstance: { findMany: instanceFindMany },
  },
}))

const { getPet, deletePet } = await import('../services/pet.service.js')

const pet = {
  id: 'p1',
  name: 'Rex',
  species: 'DOG',
  breed: 'Collie',
  dob: new Date(2021, 2, 14),
  imageUrl: null,
  createdAt: new Date(),
}

const member = { id: 'u1', firstName: 'Ben', colour: '#d16a6a' }
const completedInstance = {
  id: 'i1',
  choreId: 'c1',
  chore: { id: 'c1', title: 'Rex worming', petId: 'p1' },
  assignedTo: member,
  dueDate: new Date(2026, 5, 1),
  completedAt: new Date(2026, 5, 1),
  completedBy: member,
  notes: null,
  createdAt: new Date(),
}

beforeEach(() => {
  for (const fn of [petFindUnique, petDelete, instanceFindMany]) fn.mockReset()
})

describe('getPet', () => {
  it('returns the pet with its completed-treatment history', async () => {
    petFindUnique.mockResolvedValue(pet)
    instanceFindMany.mockResolvedValue([completedInstance])

    const result = await getPet('p1')

    expect(result.name).toBe('Rex')
    expect(result.treatmentHistory).toHaveLength(1)
    expect(result.treatmentHistory[0].chore.title).toBe('Rex worming')
    // Only this pet's completed instances are queried.
    expect(instanceFindMany.mock.calls[0][0].where).toMatchObject({
      chore: { petId: 'p1' },
      completedAt: { not: null },
    })
  })

  it('404s for a missing pet', async () => {
    petFindUnique.mockResolvedValue(null)
    await expect(getPet('nope')).rejects.toMatchObject({ status: 404 })
  })
})

describe('deletePet', () => {
  it('refuses to delete a pet that still has chores', async () => {
    petFindUnique.mockResolvedValue({ ...pet, _count: { chores: 2 } })
    await expect(deletePet('p1')).rejects.toMatchObject({ status: 409 })
    expect(petDelete).not.toHaveBeenCalled()
  })

  it('deletes a pet with no linked chores', async () => {
    petFindUnique.mockResolvedValue({ ...pet, _count: { chores: 0 } })
    await deletePet('p1')
    expect(petDelete).toHaveBeenCalledWith({ where: { id: 'p1' } })
  })
})
