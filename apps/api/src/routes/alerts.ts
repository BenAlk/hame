import { Router } from 'express'
import { SendAlertSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  listAlertRecipientsController,
  sendAlertController,
} from '../controllers/alert.controller.js'

export const alertsRouter = Router()

alertsRouter.get('/recipients', requireAuth, listAlertRecipientsController)
alertsRouter.post('/', requireAuth, verifyCsrf, validateBody(SendAlertSchema), sendAlertController)
