import { Router } from 'express'
import { CreateItemSchema, UpdateItemSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createItemController,
  deleteItemController,
  getItemController,
  listItemsController,
  updateItemController,
} from '../controllers/items.controller.js'

export const itemsRouter = Router()

itemsRouter.get('/', requireAuth, listItemsController)
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
