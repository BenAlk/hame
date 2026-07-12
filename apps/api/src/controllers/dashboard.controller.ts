import type { RequestHandler } from 'express'
import type { UpdateDashboardLayoutInput } from '@hame/shared'
import { resolveOwner } from '../lib/dashboard-owner.js'
import { getDashboardLayout, saveDashboardLayout } from '../services/dashboard.service.js'

export const getDashboardController: RequestHandler = async (req, res, next) => {
  try {
    // Reads may target any member's dashboard so the wall tablet can page through
    // them; writes (below) stay restricted to the caller's own row (spec §8.1).
    res.json(await getDashboardLayout(resolveOwner(req, { allowOtherUser: true })))
  } catch (err) {
    next(err)
  }
}

export const saveDashboardController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await saveDashboardLayout(resolveOwner(req), req.body as UpdateDashboardLayoutInput))
  } catch (err) {
    next(err)
  }
}
