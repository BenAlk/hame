import { Router } from 'express'
import { CreateTagSchema, UpdateTagSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createTagController,
  deleteTagController,
  listTagsController,
  updateTagController,
} from '../controllers/tags.controller.js'

export const tagsRouter = Router()

tagsRouter.get('/', requireAuth, listTagsController)
tagsRouter.post('/', requireAuth, verifyCsrf, validateBody(CreateTagSchema), createTagController)
tagsRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateTagSchema),
  updateTagController,
)
tagsRouter.delete('/:id', requireAuth, verifyCsrf, deleteTagController)
