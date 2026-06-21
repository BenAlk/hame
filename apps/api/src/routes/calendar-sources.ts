import { Router } from 'express'
import { CreateCalendarSourceSchema, UpdateCalendarSourceSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createCalendarSourceController,
  deleteCalendarSourceController,
  listCalendarSourcesController,
  syncCalendarSourceController,
  updateCalendarSourceController,
} from '../controllers/calendar-sources.controller.js'

export const calendarSourcesRouter = Router()

calendarSourcesRouter.get('/', requireAuth, listCalendarSourcesController)
calendarSourcesRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreateCalendarSourceSchema),
  createCalendarSourceController,
)
calendarSourcesRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateCalendarSourceSchema),
  updateCalendarSourceController,
)
calendarSourcesRouter.delete('/:id', requireAuth, verifyCsrf, deleteCalendarSourceController)
// Trigger an on-demand sync of one source.
calendarSourcesRouter.post('/:id/sync', requireAuth, verifyCsrf, syncCalendarSourceController)
