import { Router } from 'express'
import { UpdateIdleModeSettingsSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  getIdlePhotoController,
  getIdlePhotosController,
  getIdleSettingsController,
  updateIdleSettingsController,
} from '../controllers/idle.controller.js'

export const idleRouter = Router()

// Settings are member-readable so the shared wall tablet (no admin session)
// applies them, admin-only to change (spec §8.14). Photos ride through the
// backend proxy, so the Immich credential never reaches the browser.
idleRouter.get('/settings', requireAuth, getIdleSettingsController)
idleRouter.patch(
  '/settings',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(UpdateIdleModeSettingsSchema),
  updateIdleSettingsController,
)
idleRouter.get('/photos', requireAuth, getIdlePhotosController)
idleRouter.get('/photo/:id', requireAuth, getIdlePhotoController)
