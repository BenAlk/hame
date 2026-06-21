import { Router } from 'express'
import { CreateCalDavCredentialSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createCalDavCredentialController,
  deleteCalDavCredentialController,
  getCalDavConnectionController,
  listCalDavCredentialsController,
} from '../controllers/caldav-credentials.controller.js'

// Each user manages their own CalDAV app passwords (spec §10 Phase 5.5).
export const caldavCredentialsRouter = Router()

// Where to point a client (domain + LAN address). Literal path, before any params.
caldavCredentialsRouter.get('/connection', requireAuth, getCalDavConnectionController)
caldavCredentialsRouter.get('/', requireAuth, listCalDavCredentialsController)
caldavCredentialsRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreateCalDavCredentialSchema),
  createCalDavCredentialController,
)
caldavCredentialsRouter.delete('/:id', requireAuth, verifyCsrf, deleteCalDavCredentialController)
