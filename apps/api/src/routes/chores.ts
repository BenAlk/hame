import { Router } from 'express'
import { CreateChoreSchema, UpdateChoreSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createChoreController,
  deleteChoreController,
  getChoreController,
  listChoresController,
  updateChoreController,
} from '../controllers/chores.controller.js'

export const choresRouter = Router()

choresRouter.get('/', requireAuth, listChoresController)
choresRouter.get('/:id', requireAuth, getChoreController)
choresRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreateChoreSchema),
  createChoreController,
)
choresRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateChoreSchema),
  updateChoreController,
)
choresRouter.delete('/:id', requireAuth, verifyCsrf, deleteChoreController)
