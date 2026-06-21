import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getCalendarController } from '../controllers/calendar.controller.js'

export const calendarRouter = Router()

// Aggregated read-only feed (spec §8.10): GET /api/calendar?start=…&end=…
calendarRouter.get('/', requireAuth, getCalendarController)
