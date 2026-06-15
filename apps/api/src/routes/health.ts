import { Router } from 'express'

export const healthRouter = Router()

// GET /api/health -> liveness probe
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})
