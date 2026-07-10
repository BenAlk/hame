import { Router } from 'express'
import {
  CreateIntegrationSchema,
  TestIntegrationSchema,
  UpdateIntegrationSchema,
} from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createIntegrationController,
  deleteIntegrationController,
  getIntegrationController,
  listIntegrationsController,
  listProvidersController,
  listStatusController,
  syncIntegrationController,
  testIntegrationController,
  updateIntegrationController,
} from '../controllers/integration.controller.js'

export const integrationsRouter = Router()

// Member-level: the dashboard status widget reads active STATUS snapshots (no
// secrets, no config), like Home Assistant's member-level entity reads while the
// config surface stays admin-only. Declared before the admin guard below.
integrationsRouter.get('/status', requireAuth, listStatusController)

// Everything else holds a secret and reaches the homelab's own services, so it is
// admin-only (spec §10 Phase 10). Named routes (/providers, /test) are declared
// before the bare '/:id' so they aren't shadowed by it.
integrationsRouter.use(requireAuth, requireAdmin)

integrationsRouter.get('/providers', listProvidersController)
integrationsRouter.post(
  '/test',
  verifyCsrf,
  validateBody(TestIntegrationSchema),
  testIntegrationController,
)

integrationsRouter.get('/', listIntegrationsController)
integrationsRouter.post(
  '/',
  verifyCsrf,
  validateBody(CreateIntegrationSchema),
  createIntegrationController,
)

integrationsRouter.get('/:id', getIntegrationController)
integrationsRouter.patch(
  '/:id',
  verifyCsrf,
  validateBody(UpdateIntegrationSchema),
  updateIntegrationController,
)
integrationsRouter.delete('/:id', verifyCsrf, deleteIntegrationController)
integrationsRouter.post('/:id/sync', verifyCsrf, syncIntegrationController)
