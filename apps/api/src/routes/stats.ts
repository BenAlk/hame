import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getChoreStatsController } from '../controllers/stats.controller.js'

export const statsRouter = Router()

// Household "pulling your weight" chore stats (spec §10 Phase 8) — member-level,
// read-only (derived live from completion history, nothing to write).
statsRouter.get('/chores', requireAuth, getChoreStatsController)
