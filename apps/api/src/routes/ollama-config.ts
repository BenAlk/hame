import { Router } from 'express'
import { ProbeOllamaSchema, UpdateOllamaConfigSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  getOllamaConfigController,
  probeOllamaModelsController,
  updateOllamaConfigController,
} from '../controllers/ollama-config.controller.js'

export const ollamaConfigRouter = Router()

// Reading is admin-only — this is a settings/integration surface (spec §10 Phase 4.5).
ollamaConfigRouter.get('/', requireAuth, requireAdmin, getOllamaConfigController)
ollamaConfigRouter.patch(
  '/',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(UpdateOllamaConfigSchema),
  updateOllamaConfigController,
)
// Discover models for a (possibly unsaved) URL — powers the model dropdown.
ollamaConfigRouter.post(
  '/models',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(ProbeOllamaSchema),
  probeOllamaModelsController,
)
