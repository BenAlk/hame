import { Router } from 'express'
import { CreateSectionSchema, ReorderSectionsSchema, UpdateSectionSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createSectionController,
  deleteSectionController,
  listSectionsController,
  reorderSectionsController,
  updateSectionController,
} from '../controllers/sections.controller.js'

export const sectionsRouter = Router()

sectionsRouter.get('/', requireAuth, listSectionsController)
sectionsRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreateSectionSchema),
  createSectionController,
)
// Declared before `/:id` so the literal path can't be read as a section id.
sectionsRouter.patch(
  '/reorder',
  requireAuth,
  verifyCsrf,
  validateBody(ReorderSectionsSchema),
  reorderSectionsController,
)
sectionsRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateSectionSchema),
  updateSectionController,
)
sectionsRouter.delete('/:id', requireAuth, verifyCsrf, deleteSectionController)
