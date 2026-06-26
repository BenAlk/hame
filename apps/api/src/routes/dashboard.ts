import { Router } from 'express'
import { UpdateDashboardLayoutSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  getDashboardController,
  saveDashboardController,
} from '../controllers/dashboard.controller.js'

// Per-owner dashboard layouts (spec §10 Phase 7.1). Member-level: every member
// has their own layout and may edit the shared household/tablet one (?owner=…).
export const dashboardRouter = Router()

dashboardRouter.get('/', requireAuth, getDashboardController)
dashboardRouter.put(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateDashboardLayoutSchema),
  saveDashboardController,
)
