import type { User } from '@prisma/client'
import type {
  CreateUserInput,
  MemberSummary,
  PublicUser,
  TabletCredentials,
  UpdateProfileInput,
  UpdateUserInput,
} from '@hame/shared'
import { PERSON_ROLES, TABLET_FALLBACK_LABEL, TABLET_USERNAME } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { hashPassword } from '../lib/password.js'
import { generateReadablePassword } from '../lib/generate-password.js'
import { HttpError } from '../lib/http-error.js'

/** Strip the password hash — the only safe shape to ever return to a client. */
export function toPublicUser(user: User): PublicUser {
  const { password: _password, ...rest } = user
  return rest
}

/**
 * Minimal "who did this" attribution shape (id + first name + colour).
 *
 * A blank name is only ever the unnamed wall tablet (a member's first name is
 * required at the schema, spec §8.1), and this is the display shape other people
 * see — so it falls back to a label rather than crediting nobody. The account
 * shape {@link toPublicUser} deliberately returns the blank as-is: that's what
 * lets the dashboard greeting say "Good evening." with no name attached.
 */
export function toMemberSummary(user: Pick<User, 'id' | 'firstName' | 'colour'>): MemberSummary {
  return {
    id: user.id,
    firstName: user.firstName.trim() || TABLET_FALLBACK_LABEL,
    colour: user.colour,
  }
}

/** Admin user list — actual people only; the tablet account is managed separately. */
export async function listUsers(): Promise<PublicUser[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: [...PERSON_ROLES] } },
    orderBy: { createdAt: 'asc' },
  })
  return users.map(toPublicUser)
}

/**
 * Non-sensitive household roster (id + first name + colour) for assignment
 * pickers and the dashboard switcher — available to any member, unlike the
 * admin-only {@link listUsers}. Excludes the tablet account: it is not a person,
 * so it never appears as an assignee, a rotation member, or a switchable dashboard.
 */
export async function listMembers(): Promise<MemberSummary[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: [...PERSON_ROLES] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, firstName: true, colour: true },
  })
  return users.map(toMemberSummary)
}

// ── Wall-tablet account (spec §8.1) ──────────────────────────────────────────

/**
 * Placeholder profile fields for the tablet — it's furniture, not a person, so
 * it starts **unnamed**: `firstName` doubles as its optional display name and an
 * empty one makes the dashboard greeting drop the name ("Good evening."). An
 * admin can set one later via {@link setTabletName}.
 */
const TABLET_DEFAULTS = {
  firstName: '',
  surname: 'Tablet',
  colour: '#857a6c', // the Hearth "muted" token — visibly not a member colour
  dob: new Date('2000-01-01T00:00:00.000Z'),
} as const

/** The single tablet account, or null if one hasn't been provisioned yet. */
export async function getTabletAccount(): Promise<PublicUser | null> {
  const user = await prisma.user.findFirst({ where: { role: 'TABLET' } })
  return user ? toPublicUser(user) : null
}

/**
 * Provision the shared wall-tablet account (spec §8.1). Returns its login once —
 * a generated password the admin copies to the tablet; only the hash is stored.
 * At most one tablet account exists, so this 409s if one is already provisioned
 * (use {@link resetTabletPassword} to re-issue its password instead).
 */
export async function createTabletAccount(): Promise<TabletCredentials> {
  if (await prisma.user.findFirst({ where: { role: 'TABLET' } })) {
    throw HttpError.conflict('A tablet account already exists')
  }
  await assertUsernameAvailable(TABLET_USERNAME)
  const password = generateReadablePassword()
  await prisma.user.create({
    data: {
      username: TABLET_USERNAME,
      password: await hashPassword(password),
      role: 'TABLET',
      ...TABLET_DEFAULTS,
    },
  })
  return { username: TABLET_USERNAME, password }
}

/**
 * Re-issue the tablet account's password (returned once), revoking any existing
 * tablet sessions via the token-version bump (§11). 404 if no tablet exists.
 */
export async function resetTabletPassword(): Promise<TabletCredentials> {
  const tablet = await prisma.user.findFirst({ where: { role: 'TABLET' } })
  if (!tablet) throw HttpError.notFound('No tablet account exists')
  const password = generateReadablePassword()
  await prisma.user.update({
    where: { id: tablet.id },
    data: { password: await hashPassword(password), tokenVersion: { increment: 1 } },
  })
  return { username: tablet.username, password }
}

/**
 * Name the wall tablet, or clear its name with an empty string (spec §8.1). The
 * name is stored as the account's `firstName`, so it reads exactly like a
 * member's wherever one is shown — the greeting, "added by", a QuickNote author.
 * 404 if no tablet exists.
 */
export async function setTabletName(name: string): Promise<PublicUser> {
  const tablet = await prisma.user.findFirst({ where: { role: 'TABLET' } })
  if (!tablet) throw HttpError.notFound('No tablet account exists')
  const user = await prisma.user.update({
    where: { id: tablet.id },
    data: { firstName: name.trim() },
  })
  return toPublicUser(user)
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
  await assertNotTablet(id)
  if (input.role === 'MEMBER') {
    await assertNotLastAdmin(id, 'demote the last admin')
  }
  return applyUserUpdate(id, input)
}

export async function deleteUser(actingUserId: string, id: string): Promise<void> {
  if (actingUserId === id) {
    throw HttpError.badRequest('You cannot delete your own account')
  }
  await assertNotTablet(id)
  await assertNotLastAdmin(id, 'delete the last admin')
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('User not found')

  // Reassign everything the departing member created, was assigned, or completed
  // to the acting admin so no foreign-key references dangle, drop them from any
  // chore rotations, then delete. History is preserved but reattributed.
  await prisma.$transaction([
    prisma.item.updateMany({ where: { createdById: id }, data: { createdById: actingUserId } }),
    prisma.shoppingList.updateMany({
      where: { createdById: id },
      data: { createdById: actingUserId },
    }),
    prisma.shoppingListItem.updateMany({
      where: { addedById: id },
      data: { addedById: actingUserId },
    }),
    prisma.pantryEntry.updateMany({ where: { addedById: id }, data: { addedById: actingUserId } }),
    prisma.chore.updateMany({ where: { createdById: id }, data: { createdById: actingUserId } }),
    prisma.chore.updateMany({ where: { assignedToId: id }, data: { assignedToId: actingUserId } }),
    prisma.choreInstance.updateMany({
      where: { assignedToId: id },
      data: { assignedToId: actingUserId },
    }),
    prisma.choreInstance.updateMany({
      where: { completedById: id },
      data: { completedById: actingUserId },
    }),
    prisma.user.update({ where: { id }, data: { choresRotation: { set: [] } } }),
    prisma.user.delete({ where: { id } }),
  ])
}

// ── internals ──────────────────────────────────────────────────────────────

async function applyUserUpdate(
  id: string,
  input: UpdateProfileInput & { role?: PublicUser['role'] },
): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('User not found')

  // A password or role change must revoke the user's existing sessions (§11).
  const revokesSessions = input.password !== undefined || input.role !== undefined

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
      ...(revokesSessions && { tokenVersion: { increment: 1 } }),
    },
  })
  return toPublicUser(user)
}

/** The tablet account is not a person — its lifecycle is the dedicated tablet
 *  endpoints, so the generic person update/delete must refuse it (a role change
 *  could otherwise hand it admin, breaking the "no settings access" guarantee). */
async function assertNotTablet(id: string): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
  if (target?.role === 'TABLET') {
    throw HttpError.badRequest('Manage the tablet account from the Tablet card')
  }
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
