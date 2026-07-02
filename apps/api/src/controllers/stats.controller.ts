import type { RequestHandler } from 'express'
import { StatsWindowSchema } from '@hame/shared'
import { HttpError } from '../lib/http-error.js'
import { getChoreStats } from '../services/stats.service.js'

/** Household chore stats (spec §8.7, §10 Phase 8) — member-level; `?days=` window. */
export const getChoreStatsController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = StatsWindowSchema.safeParse(req.query.days)
    if (!parsed.success)
      throw HttpError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid window')
    res.json(await getChoreStats(parsed.data))
  } catch (err) {
    next(err)
  }
}
