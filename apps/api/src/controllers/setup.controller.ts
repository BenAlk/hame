import type { RequestHandler } from 'express'
import type { SetupInput } from '@hame/shared'
import { getSetupStatus } from '../services/setup.service.js'
import { createInitialAdmin } from '../services/auth.service.js'

export const setupStatusController: RequestHandler = async (_req, res, next) => {
  try {
    const status = await getSetupStatus()
    res.json(status)
  } catch (err) {
    next(err)
  }
}

export const setupController: RequestHandler = async (req, res, next) => {
  try {
    // Returns { admin, tablet } — the frontend shows the tablet login once, then
    // routes to /login (no auto-login; spec §8.1).
    const result = await createInitialAdmin(req.body as SetupInput)
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
}
