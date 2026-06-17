import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const count = vi.fn()
const create = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { user: { findUnique, count, create } },
}))

const { login, createInitialAdmin } = await import('../services/auth.service.js')

beforeEach(() => {
  for (const fn of [findUnique, count, create]) fn.mockReset()
})

describe('login', () => {
  it('rejects an unknown username with a generic 401', async () => {
    findUnique.mockResolvedValue(null)
    await expect(login('nobody', 'whatever')).rejects.toMatchObject({ status: 401 })
  })
})

describe('createInitialAdmin', () => {
  it('refuses once any user already exists', async () => {
    count.mockResolvedValue(1)
    await expect(
      createInitialAdmin({
        username: 'ben',
        password: 'password123',
        firstName: 'Ben',
        surname: 'Alkureishi',
        colour: '#3B82F6',
        dob: new Date('1990-01-01'),
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(create).not.toHaveBeenCalled()
  })
})
