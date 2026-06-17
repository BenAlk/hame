import { Router } from 'express'
import { SetupSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { setupController, setupStatusController } from '../controllers/setup.controller.js'

export const setupRouter = Router()

// GET /api/setup/status -> { requiresSetup: boolean }
setupRouter.get('/status', setupStatusController)

// POST /api/setup -> create the first-run admin (guarded server-side).
setupRouter.post('/', validateBody(SetupSchema), setupController)
