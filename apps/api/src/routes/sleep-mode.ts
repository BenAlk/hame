import { Router } from 'express'
import { UpdateSleepModeSettingsSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  getSleepModeSettingsController,
  updateSleepModeSettingsController,
} from '../controllers/sleep-mode.controller.js'

export const sleepModeRouter = Router()

// Settings are member-readable so the shared wall tablet (no admin session)
// applies them, admin-only to change (spec §8.14a).
sleepModeRouter.get('/settings', requireAuth, getSleepModeSettingsController)
sleepModeRouter.patch(
  '/settings',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(UpdateSleepModeSettingsSchema),
  updateSleepModeSettingsController,
)
