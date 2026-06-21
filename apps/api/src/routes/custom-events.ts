import { Router } from 'express'
import { CreateCustomEventSchema, UpdateCustomEventSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createCustomEventController,
  deleteCustomEventController,
  listCustomEventsController,
  updateCustomEventController,
} from '../controllers/custom-events.controller.js'

export const customEventsRouter = Router()

customEventsRouter.get('/', requireAuth, listCustomEventsController)
customEventsRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreateCustomEventSchema),
  createCustomEventController,
)
customEventsRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateCustomEventSchema),
  updateCustomEventController,
)
customEventsRouter.delete('/:id', requireAuth, verifyCsrf, deleteCustomEventController)
