import { Router } from 'express'
import { SetConsumableSchema, UpdateConsumableSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  listConsumablesController,
  removeConsumableController,
  setConsumableController,
  updateConsumableController,
} from '../controllers/consumables.controller.js'

export const consumablesRouter = Router()

consumablesRouter.get('/', requireAuth, listConsumablesController)
consumablesRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(SetConsumableSchema),
  setConsumableController,
)
consumablesRouter.patch(
  '/:itemId',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateConsumableSchema),
  updateConsumableController,
)
consumablesRouter.delete('/:itemId', requireAuth, verifyCsrf, removeConsumableController)
