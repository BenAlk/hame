import type { PublicUser } from '@hame/shared'

// Augment Express' Request with the authenticated user attached by requireAuth.
declare global {
  namespace Express {
    interface Request {
      user?: PublicUser
    }
  }
}

export {}
