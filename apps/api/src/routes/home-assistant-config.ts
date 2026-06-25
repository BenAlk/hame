import { Router } from 'express'
import {
  HaServiceCallSchema,
  SmartHomeEntityIdsSchema,
  TestHomeAssistantSchema,
  UpdateHomeAssistantConfigSchema,
  UpdateSmartHomeSettingsSchema,
} from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  addSmartHomeControlsController,
  controlHomeAssistantController,
  dismissSmartHomeSuggestionsController,
  getHomeAssistantBinSensorsController,
  getHomeAssistantCalendarsController,
  getHomeAssistantConfigController,
  getHomeAssistantEntitiesController,
  getSmartHomeSettingsController,
  getSmartHomeSuggestionsController,
  homeAssistantStreamController,
  testHomeAssistantController,
  updateHomeAssistantConfigController,
  updateSmartHomeSettingsController,
} from '../controllers/home-assistant-config.controller.js'

export const homeAssistantConfigRouter = Router()

// Entity reads + device controls are available to any signed-in member (dashboard
// surface), unlike the admin-only config below. Declared first so these named
// paths aren't shadowed by the bare '/' config routes.
homeAssistantConfigRouter.get('/entities', requireAuth, getHomeAssistantEntitiesController)
homeAssistantConfigRouter.get('/stream', requireAuth, homeAssistantStreamController)
// Commands ride REST (the §10 Phase 6.2 SSE note); the API relays them on the socket.
homeAssistantConfigRouter.post(
  '/service',
  requireAuth,
  verifyCsrf,
  validateBody(HaServiceCallSchema),
  controlHomeAssistantController,
)
// Calendar names are benign household data (like /entities) and feed the
// member-accessible calendar-source picker, so this is member-level, not admin.
homeAssistantConfigRouter.get('/calendars', requireAuth, getHomeAssistantCalendarsController)
// Bin sensors feed the member-accessible bin-source picker (spec §10 Phase 6),
// like /calendars — household data, no token, so member-level not admin.
homeAssistantConfigRouter.get('/bin-sensors', requireAuth, getHomeAssistantBinSensorsController)

// The curated smart-home control list — member-level, since the wall tablet is
// shared (no token involved; just which entities appear on the dashboard widget).
homeAssistantConfigRouter.get('/controls', requireAuth, getSmartHomeSettingsController)
homeAssistantConfigRouter.put(
  '/controls',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateSmartHomeSettingsSchema),
  updateSmartHomeSettingsController,
)

// New-device prompt (spec §10 Phase 6.3): list new controllable devices, then
// add them to the widget or dismiss them — both mark them "offered" so the
// dashboard stops asking. Member-level, like the rest of the control surface.
homeAssistantConfigRouter.get('/suggestions', requireAuth, getSmartHomeSuggestionsController)
homeAssistantConfigRouter.post(
  '/controls/add',
  requireAuth,
  verifyCsrf,
  validateBody(SmartHomeEntityIdsSchema),
  addSmartHomeControlsController,
)
homeAssistantConfigRouter.post(
  '/controls/dismiss',
  requireAuth,
  verifyCsrf,
  validateBody(SmartHomeEntityIdsSchema),
  dismissSmartHomeSuggestionsController,
)

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
