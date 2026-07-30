import { Router } from 'express'
import {
  CreateItemSchema,
  SuggestSectionSchema,
  SuggestTagsSchema,
  UpdateItemSchema,
} from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createItemController,
  deleteItemController,
  getItemController,
  listItemsController,
  suggestSectionController,
  suggestTagsController,
  updateItemController,
  warmUpSuggestionsController,
} from '../controllers/items.controller.js'

export const itemsRouter = Router()

itemsRouter.get('/', requireAuth, listItemsController)
// Declared before `/:id` so the literal path can't be read as an item id.
itemsRouter.post(
  '/suggest-tags',
  requireAuth,
  verifyCsrf,
  validateBody(SuggestTagsSchema),
  suggestTagsController,
)
itemsRouter.post(
  '/suggest-section',
  requireAuth,
  verifyCsrf,
  validateBody(SuggestSectionSchema),
  suggestSectionController,
)
itemsRouter.post('/warm-suggestions', requireAuth, verifyCsrf, warmUpSuggestionsController)
itemsRouter.get('/:id', requireAuth, getItemController)
itemsRouter.post('/', requireAuth, verifyCsrf, validateBody(CreateItemSchema), createItemController)
itemsRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateItemSchema),
  updateItemController,
)
itemsRouter.delete('/:id', requireAuth, verifyCsrf, deleteItemController)
