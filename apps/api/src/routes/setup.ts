import { Router } from 'express'
import { setupStatusController } from '../controllers/setup.controller.js'

export const setupRouter = Router()

// GET /api/setup/status -> { requiresSetup: boolean }
setupRouter.get('/status', setupStatusController)
