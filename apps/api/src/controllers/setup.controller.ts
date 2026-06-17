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
    const admin = await createInitialAdmin(req.body as SetupInput)
    // No auto-login — the frontend routes to /login afterwards (spec §8.1).
    res.status(201).json(admin)
  } catch (err) {
    next(err)
  }
}
