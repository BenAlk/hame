import { networkInterfaces } from 'node:os'
import type { CalDavConnection, CalDavCredential, CalDavCredentialCreated } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { HttpError } from '../lib/http-error.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { generateReadablePassword } from '../lib/generate-password.js'

// A real argon2 hash of a throwaway value, computed once. Verifying against it
// when the username is unknown (or has no app passwords) equalises response
// timing so valid CalDAV usernames can't be enumerated by how long a failed
// auth takes — the same defence as the login path (auth.service.ts).
let dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('hame-caldav-timing-equaliser')
  return dummyHash
}

function toCredential(row: {
  id: string
  label: string
  lastUsedAt: Date | null
  createdAt: Date
}): CalDavCredential {
  return { id: row.id, label: row.label, lastUsedAt: row.lastUsedAt, createdAt: row.createdAt }
}

/** First non-internal IPv4, preferring private LAN ranges over Docker/VPN bridges. */
function detectLanAddress(): string | null {
  const candidates: string[] = []
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) candidates.push(a.address)
    }
  }
  const preferred = candidates.find((ip) => ip.startsWith('192.168.') || ip.startsWith('10.'))
  return preferred ?? candidates[0] ?? null
}

/** Where CalDAV clients should connect (spec §10 Phase 5.5) — domain and/or LAN address. */
export function getCalDavConnection(): CalDavConnection {
  return { publicUrl: env.CALDAV_PUBLIC_URL || null, lanAddress: detectLanAddress() }
}

export async function listCalDavCredentials(userId: string): Promise<CalDavCredential[]> {
  const rows = await prisma.calDavCredential.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(toCredential)
}

/** Mint a credential, returning the plaintext password once (only the hash is stored). */
export async function createCalDavCredential(
  userId: string,
  label: string,
): Promise<CalDavCredentialCreated> {
  const password = generateReadablePassword()
  const row = await prisma.calDavCredential.create({
    data: { userId, label, passwordHash: await hashPassword(password) },
  })
  return { ...toCredential(row), password }
}

export async function deleteCalDavCredential(userId: string, id: string): Promise<void> {
  const row = await prisma.calDavCredential.findUnique({ where: { id } })
  if (!row || row.userId !== userId) throw HttpError.notFound('Credential not found')
  await prisma.calDavCredential.delete({ where: { id } })
}

/**
 * Validate HTTP Basic credentials from a CalDAV client: match the username to a
 * user, then verify the supplied password against any of that user's app
 * passwords. Returns the user id on success (and stamps `lastUsedAt`), else null.
 */
export async function verifyCalDavAuth(
  username: string,
  password: string,
): Promise<{ userId: string } | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, calDavCredentials: { select: { id: true, passwordHash: true } } },
  })
  if (!user || user.calDavCredentials.length === 0) {
    // Burn one hash verify so an unknown / credential-less user takes the same
    // time as a real password check (see getDummyHash).
    await verifyPassword(await getDummyHash(), password).catch(() => false)
    return null
  }
  for (const cred of user.calDavCredentials) {
    if (await verifyPassword(cred.passwordHash, password).catch(() => false)) {
      await prisma.calDavCredential
        .update({ where: { id: cred.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined)
      return { userId: user.id }
    }
  }
  return null
}
