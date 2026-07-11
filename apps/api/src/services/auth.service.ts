import type { PublicUser, SetupInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { HttpError } from '../lib/http-error.js'
import { clearSetupToken, verifySetupToken } from '../lib/setup-token.js'
import { toPublicUser } from './user.service.js'

// A real argon2 hash of a throwaway value, computed once. Verifying against it
// for unknown usernames equalises response timing so accounts can't be
// enumerated by how long a failed login takes.
let dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('hame-timing-equaliser')
  return dummyHash
}

/** Verify credentials, returning the public user. Generic failure by design. */
export async function login(username: string, password: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { username } })

  if (!user) {
    await verifyPassword(await getDummyHash(), password).catch(() => false)
    throw HttpError.unauthorized('Invalid username or password')
  }

  const ok = await verifyPassword(user.password, password).catch(() => false)
  if (!ok) throw HttpError.unauthorized('Invalid username or password')

  return toPublicUser(user)
}

/** First-run only: create the initial ADMIN. Rejected once any user exists. */
export async function createInitialAdmin(input: SetupInput): Promise<PublicUser> {
  const userCount = await prisma.user.count()
  if (userCount > 0) throw HttpError.conflict('Setup has already been completed')

  // Prove the caller controls the server: the token was printed to its logs on
  // first-run boot (spec §8.1, setup-token.ts).
  if (!verifySetupToken(input.setupToken)) {
    throw HttpError.forbidden('Invalid or missing setup token')
  }

  const user = await prisma.user.create({
    data: {
      username: input.username,
      password: await hashPassword(input.password),
      firstName: input.firstName,
      surname: input.surname,
      colour: input.colour,
      dob: input.dob,
      role: 'ADMIN',
    },
  })
  clearSetupToken()
  return toPublicUser(user)
}
