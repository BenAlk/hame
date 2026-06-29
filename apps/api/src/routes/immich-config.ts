import { Router } from 'express'
import { TestImmichSchema, UpdateImmichConfigSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  getImmichConfigController,
  listImmichAlbumsController,
  testImmichController,
  updateImmichConfigController,
} from '../controllers/immich-config.controller.js'

export const immichConfigRouter = Router()

// Admin-only — an integration/settings surface holding a secret API key (spec
// §10 Phase 7.3), mirroring the Home Assistant config slice. The screensaver
// itself doesn't read this; it pulls photos via the member-level /api/idle routes.
immichConfigRouter.get('/', requireAuth, requireAdmin, getImmichConfigController)
immichConfigRouter.patch(
  '/',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(UpdateImmichConfigSchema),
  updateImmichConfigController,
)
// Probe a (possibly unsaved) URL + key before committing it.
immichConfigRouter.post(
  '/test',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(TestImmichSchema),
  testImmichController,
)
// The album list feeds the Settings picker.
immichConfigRouter.get('/albums', requireAuth, requireAdmin, listImmichAlbumsController)
