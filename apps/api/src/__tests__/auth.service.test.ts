import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const findFirst = vi.fn()
const count = vi.fn()
const create = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { user: { findUnique, findFirst, count, create } },
}))

const { login, createInitialAdmin } = await import('../services/auth.service.js')
const { generateSetupToken, getSetupToken, clearSetupToken } = await import('../lib/setup-token.js')

const baseAdminInput = {
  username: 'ben',
  password: 'password123',
  firstName: 'Ben',
  surname: 'Alkureishi',
  colour: '#3B82F6',
  dob: new Date('1990-01-01'),
}

beforeEach(() => {
  for (const fn of [findUnique, findFirst, count, create]) fn.mockReset()
  // No existing tablet account, and the tablet username is free (for the
  // auto-provision step that runs after the admin is created).
  findFirst.mockResolvedValue(null)
  findUnique.mockResolvedValue(null)
  clearSetupToken()
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
      createInitialAdmin({ ...baseAdminInput, setupToken: generateSetupToken() }),
    ).rejects.toMatchObject({ status: 409 })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects a missing or wrong setup token with a 403', async () => {
    count.mockResolvedValue(0)
    generateSetupToken()
    await expect(
      createInitialAdmin({ ...baseAdminInput, setupToken: 'not-the-token' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects when no token is outstanding (setup already consumed)', async () => {
    count.mockResolvedValue(0)
    // No generateSetupToken() call — nothing to match against.
    await expect(
      createInitialAdmin({ ...baseAdminInput, setupToken: 'anything' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(create).not.toHaveBeenCalled()
  })

  it('creates the admin, auto-provisions the tablet, and clears the token', async () => {
    count.mockResolvedValue(0)
    create.mockResolvedValue({
      id: 'u1',
      ...baseAdminInput,
      password: 'hashed',
      role: 'ADMIN',
      avatarUrl: null,
      tokenVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const token = generateSetupToken()

    const result = await createInitialAdmin({ ...baseAdminInput, setupToken: token })

    // Admin first, then the shared wall-tablet account (spec §8.1).
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0][0].data.role).toBe('ADMIN')
    expect(create.mock.calls[1][0].data.role).toBe('TABLET')
    // The tablet login is returned once for the operator to sign the tablet in.
    expect(result.admin.role).toBe('ADMIN')
    expect(result.tablet.username).toBe('tablet')
    expect(result.tablet.password).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}-[a-z2-9]{5}-[a-z2-9]{5}$/)
    // Token is single-use: consumed on success so a replay can't create another.
    expect(getSetupToken()).toBeNull()
  })
})
