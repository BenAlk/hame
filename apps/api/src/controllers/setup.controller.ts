import type { RequestHandler } from 'express'
import { getSetupStatus } from '../services/setup.service.js'

export const setupStatusController: RequestHandler = async (_req, res, next) => {
  try {
    const status = await getSetupStatus()
    res.json(status)
  } catch (err) {
    next(err)
  }
}
