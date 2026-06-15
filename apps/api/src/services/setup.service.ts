import type { SetupStatus } from '@hame/shared'
import { prisma } from '../lib/prisma.js'

/**
 * The app "requires setup" until the first (admin) user exists.
 * Drives the frontend's /setup vs /login routing on first run.
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  const userCount = await prisma.user.count()
  return { requiresSetup: userCount === 0 }
}
