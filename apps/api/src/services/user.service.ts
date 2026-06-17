import type { User } from '@prisma/client'
import type { CreateUserInput, PublicUser, UpdateProfileInput, UpdateUserInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { hashPassword } from '../lib/password.js'
import { HttpError } from '../lib/http-error.js'

/** Strip the password hash — the only safe shape to ever return to a client. */
export function toPublicUser(user: User): PublicUser {
  const { password: _password, ...rest } = user
  return rest
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
  return users.map(toPublicUser)
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw HttpError.notFound('User not found')
  return toPublicUser(user)
}

/** Admin-only: create a user (defaults to MEMBER unless a role is given). */
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  await assertUsernameAvailable(input.username)
  const user = await prisma.user.create({
    data: {
      username: input.username,
      password: await hashPassword(input.password),
      firstName: input.firstName,
      surname: input.surname,
      colour: input.colour,
      dob: input.dob,
      role: input.role ?? 'MEMBER',
    },
  })
  return toPublicUser(user)
}

/** A member updating their own profile — role can never be changed here. */
export function updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
  return applyUserUpdate(userId, input)
}

/** Admin updating any user, including a role change (guards the last admin). */
export async function adminUpdateUser(id: string, input: UpdateUserInput): Promise<PublicUser> {
  if (input.role === 'MEMBER') {
    await assertNotLastAdmin(id, 'demote the last admin')
  }
  return applyUserUpdate(id, input)
}

export async function deleteUser(actingUserId: string, id: string): Promise<void> {
  if (actingUserId === id) {
    throw HttpError.badRequest('You cannot delete your own account')
  }
  await assertNotLastAdmin(id, 'delete the last admin')
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('User not found')
  await prisma.user.delete({ where: { id } })
}

// ── internals ──────────────────────────────────────────────────────────────

async function applyUserUpdate(
  id: string,
  input: UpdateProfileInput & { role?: PublicUser['role'] },
): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('User not found')

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.surname !== undefined && { surname: input.surname }),
      ...(input.colour !== undefined && { colour: input.colour }),
      ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      ...(input.dob !== undefined && { dob: input.dob }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.password !== undefined && { password: await hashPassword(input.password) }),
    },
  })
  return toPublicUser(user)
}

async function assertUsernameAvailable(username: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) throw HttpError.conflict('That username is already taken')
}

/** Reject an action that would remove the household's last remaining admin. */
async function assertNotLastAdmin(id: string, action: string): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target || target.role !== 'ADMIN') return
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
  if (adminCount <= 1) throw HttpError.badRequest(`You cannot ${action}`)
}
