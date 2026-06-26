import type { Request, RequestHandler } from 'express'
import type { UpdateDashboardLayoutInput } from '@hame/shared'
import { HttpError } from '../lib/http-error.js'
import {
  getDashboardLayout,
  saveDashboardLayout,
  type DashboardOwner,
} from '../services/dashboard.service.js'

/**
 * Which dashboard the request targets: `?owner=household` for the shared
 * wall-tablet layout, otherwise the signed-in user's own (`me`/omitted).
 * Member-level either way — the tablet is shared (spec §10 Phase 7.1).
 */
function resolveOwner(req: Request): DashboardOwner {
  const owner = req.query.owner
  if (owner === 'household') return { kind: 'household' }
  if (owner !== undefined && owner !== 'me') {
    throw HttpError.badRequest('owner must be "me" or "household"')
  }
  const userId = req.user?.id
  if (!userId) throw HttpError.unauthorized()
  return { kind: 'user', userId }
}

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
