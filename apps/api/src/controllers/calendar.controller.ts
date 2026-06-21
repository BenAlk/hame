import type { RequestHandler } from 'express'
import { CalendarQuerySchema } from '@hame/shared'
import { HttpError } from '../lib/http-error.js'
import { getCalendar } from '../services/calendar.service.js'

export const getCalendarController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = CalendarQuerySchema.safeParse(req.query)
    if (!parsed.success) throw HttpError.badRequest('start and end dates are required')
    const { start, end } = parsed.data
    if (end < start) throw HttpError.badRequest('end must be on or after start')
    res.json(await getCalendar(start, end))
  } catch (err) {
    next(err)
  }
}
