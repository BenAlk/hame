import { Router } from 'express'
import { UpdateHouseholdSettingsSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  getHouseholdSettingsController,
  updateHouseholdSettingsController,
} from '../controllers/household-settings.controller.js'

export const householdSettingsRouter = Router()

// Anyone may read settings (the meal-plan UI needs them); only admins change them.
householdSettingsRouter.get('/', requireAuth, getHouseholdSettingsController)
householdSettingsRouter.patch(
  '/',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(UpdateHouseholdSettingsSchema),
  updateHouseholdSettingsController,
)
