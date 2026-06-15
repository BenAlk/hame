import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import { pinoHttp } from 'pino-http'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { apiRouter } from './routes/index.js'
import { notFoundHandler } from './middleware/not-found.js'
import { errorHandler } from './middleware/error.js'

export function createApp() {
  const app = express()

  // Behind Cloudflare + reverse proxy in production: trust the first proxy hop
  // so rate limiting and req.ip use the real client IP (see spec §11).
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1)
  }

  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(pinoHttp({ logger }))

  // Brute-force protection on auth endpoints (5 attempts / 15 min per IP).
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  )

  app.use('/api', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
