import { Router } from 'express'
import {
  AddConsumablesToListSchema,
  AddShoppingItemSchema,
  ArchiveShoppingListSchema,
  CreateShoppingListSchema,
  UpdateShoppingItemSchema,
  UpdateShoppingListSchema,
} from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  addConsumablesToListController,
  addShoppingItemController,
  archiveShoppingListController,
  createShoppingListController,
  deleteShoppingListController,
  getShoppingListController,
  listShoppingListsController,
  removeShoppingItemController,
  updateShoppingItemController,
  updateShoppingListController,
} from '../controllers/shopping.controller.js'

export const shoppingListsRouter = Router()

shoppingListsRouter.get('/', requireAuth, listShoppingListsController)
shoppingListsRouter.get('/:id', requireAuth, getShoppingListController)
shoppingListsRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreateShoppingListSchema),
  createShoppingListController,
)
shoppingListsRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateShoppingListSchema),
  updateShoppingListController,
)
shoppingListsRouter.delete('/:id', requireAuth, verifyCsrf, deleteShoppingListController)

shoppingListsRouter.post(
  '/:id/archive',
  requireAuth,
  verifyCsrf,
  validateBody(ArchiveShoppingListSchema),
  archiveShoppingListController,
)

shoppingListsRouter.post(
  '/:id/consumables',
  requireAuth,
  verifyCsrf,
  validateBody(AddConsumablesToListSchema),
  addConsumablesToListController,
)

// List items (nested under a list)
shoppingListsRouter.post(
  '/:id/items',
  requireAuth,
  verifyCsrf,
  validateBody(AddShoppingItemSchema),
  addShoppingItemController,
)
shoppingListsRouter.patch(
  '/:id/items/:itemId',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateShoppingItemSchema),
  updateShoppingItemController,
)
shoppingListsRouter.delete(
  '/:id/items/:itemId',
  requireAuth,
  verifyCsrf,
  removeShoppingItemController,
)
