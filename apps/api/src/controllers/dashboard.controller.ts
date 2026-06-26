import type { RequestHandler } from 'express'
import type { UpdateDashboardLayoutInput } from '@hame/shared'
import { resolveOwner } from '../lib/dashboard-owner.js'
import { getDashboardLayout, saveDashboardLayout } from '../services/dashboard.service.js'

export const getDashboardController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getDashboardLayout(resolveOwner(req)))
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
