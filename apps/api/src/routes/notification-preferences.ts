import { Router } from 'express'
import { UpdateNotificationPreferenceSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  getNotificationPreferenceController,
  updateNotificationPreferenceController,
} from '../controllers/notification-preference.controller.js'

export const notificationPreferencesRouter = Router()

// A user's own preferences (spec §10 Phase 8) — member-level, no admin needed.
notificationPreferencesRouter.get('/', requireAuth, getNotificationPreferenceController)
notificationPreferencesRouter.patch(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateNotificationPreferenceSchema),
  updateNotificationPreferenceController,
)
