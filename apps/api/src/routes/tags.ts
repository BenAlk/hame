import { Router } from 'express'
import { CreateTagSchema, UpdateTagSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createTagController,
  deleteTagController,
  listTagsController,
  updateTagController,
} from '../controllers/tags.controller.js'

export const tagsRouter = Router()

tagsRouter.get('/', requireAuth, listTagsController)

// Creating stays open to every member: it happens inline while tagging an item or
// a recipe, and the surface supplies the kind. Editing and deleting are the
// household's shared vocabulary — one rename or delete reaches every item, recipe
// and chore carrying that tag — so they belong with the rest of Settings (§10
// Phase 24), which is admin-only.
tagsRouter.post('/', requireAuth, verifyCsrf, validateBody(CreateTagSchema), createTagController)
tagsRouter.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(UpdateTagSchema),
  updateTagController,
)
tagsRouter.delete('/:id', requireAuth, requireAdmin, verifyCsrf, deleteTagController)
