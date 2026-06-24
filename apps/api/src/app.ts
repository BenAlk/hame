import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import { pinoHttp } from 'pino-http'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { apiRouter } from './routes/index.js'
import { caldavRouter } from './routes/caldav.js'
import { ensureCsrfCookie } from './middleware/csrf.js'
import { notFoundHandler } from './middleware/not-found.js'
import { errorHandler } from './middleware/error.js'
import { registerBuiltInBinProviders } from './integrations/bin-sources/index.js'

export function createApp() {
  // Wire the external bin-source providers (iCal today) into their registry so a
  // sync can dispatch to them (spec §10 Phase 5.6). Idempotent.
  registerBuiltInBinProviders()

  const app = express()

  // Behind Cloudflare + reverse proxy in production: trust the first proxy hop
  // so rate limiting and req.ip use the real client IP (see spec §11).
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1)
  }

  app.use(helmet())
  // CORS only on the browser API. The CalDAV server (/caldav) is reached by
  // native clients (DAVx5), not browsers, and must handle its own OPTIONS —
  // a global cors() would swallow those as preflight (spec §10 Phase 5.5).
  app.use(
    '/api',
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(pinoHttp({ logger }))

  // Ensure every client has a readable CSRF token to echo back on mutations.
  app.use(ensureCsrfCookie)

  // Brute-force protection on login only (5 attempts / 15 min per IP). Scoped to
  // the credential-guessing surface — NOT the whole /api/auth tree, since `/me`
  // is called on every page load and `/logout` is benign; throttling those would
  // log active users out after a few refreshes.
  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  )

  app.use('/api', apiRouter)

  // CalDAV server (spec §10 Phase 5.5) — lives outside /api; clients discover it
  // via /.well-known/caldav. Self-gates on the household toggle + app-password auth.
  // Any method (DAVx5 uses PROPFIND here, not GET) → redirect to the CalDAV root.
  app.all('/.well-known/caldav', (_req, res) => res.redirect(301, '/caldav/'))
  app.use('/caldav', caldavRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
