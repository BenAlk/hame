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
    // `end` arrives as a date (UTC midnight); widen it to end-of-day so timed
    // events later on the final day aren't clipped from the window.
    const endOfDay = new Date(end.getTime() + 86_399_999)
    res.json(await getCalendar(start, endOfDay))
  } catch (err) {
    next(err)
  }
}
