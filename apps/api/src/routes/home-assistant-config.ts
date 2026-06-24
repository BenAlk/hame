import { Router } from 'express'
import { TestHomeAssistantSchema, UpdateHomeAssistantConfigSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  getHomeAssistantConfigController,
  getHomeAssistantEntitiesController,
  homeAssistantStreamController,
  testHomeAssistantController,
  updateHomeAssistantConfigController,
} from '../controllers/home-assistant-config.controller.js'

export const homeAssistantConfigRouter = Router()

// Entity reads are available to any signed-in member (dashboard data), unlike the
// admin-only config below. Declared first so '/entities' and '/stream' aren't
// shadowed by the bare '/' config routes.
homeAssistantConfigRouter.get('/entities', requireAuth, getHomeAssistantEntitiesController)
homeAssistantConfigRouter.get('/stream', requireAuth, homeAssistantStreamController)

// Admin-only — an integration/settings surface holding a secret token (spec §10 Phase 6).
homeAssistantConfigRouter.get('/', requireAuth, requireAdmin, getHomeAssistantConfigController)
homeAssistantConfigRouter.patch(
  '/',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(UpdateHomeAssistantConfigSchema),
  updateHomeAssistantConfigController,
)
// Probe a (possibly unsaved) URL + token before committing it.
homeAssistantConfigRouter.post(
  '/test',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(TestHomeAssistantSchema),
  testHomeAssistantController,
)
