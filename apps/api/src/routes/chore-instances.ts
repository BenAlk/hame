import { Router } from 'express'
import { CompleteInstanceSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  completeInstanceController,
  listChoreInstancesController,
  uncompleteInstanceController,
} from '../controllers/chores.controller.js'

export const choreInstancesRouter = Router()

choreInstancesRouter.get('/', requireAuth, listChoreInstancesController)
choreInstancesRouter.post(
  '/:id/complete',
  requireAuth,
  verifyCsrf,
  validateBody(CompleteInstanceSchema),
  completeInstanceController,
)
choreInstancesRouter.post('/:id/uncomplete', requireAuth, verifyCsrf, uncompleteInstanceController)
