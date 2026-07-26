import { Router } from 'express'
import { CreateShopSchema, UpdateShopSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createShopController,
  deleteShopController,
  listShopsController,
  updateShopController,
} from '../controllers/shops.controller.js'

export const shopsRouter = Router()

shopsRouter.get('/', requireAuth, listShopsController)
shopsRouter.post('/', requireAuth, verifyCsrf, validateBody(CreateShopSchema), createShopController)
shopsRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateShopSchema),
  updateShopController,
)
shopsRouter.delete('/:id', requireAuth, verifyCsrf, deleteShopController)
