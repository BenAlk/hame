import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import type { Request } from 'express'
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
  // A backup restore carries the whole database as one JSON envelope, so it needs
  // a much larger body than the rest of the API (spec §8.15). Parse that route
  // first with a generous limit; body-parser then skips the coarse 1mb global
  // parser below (it no-ops once a body is already parsed).
  app.use('/api/backup/import', express.json({ limit: '100mb' }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(pinoHttp({ logger }))

  // Ensure every client has a readable CSRF token to echo back on mutations.
  app.use(ensureCsrfCookie)

  // Rate-limit key: behind Cloudflare, req.ip is Cloudflare's edge IP (every
  // external user would share one bucket), so prefer the real client from
  // CF-Connecting-IP. On-LAN there's no CF header and req.ip is the device.
  const clientIpKey = (req: Request): string =>
    (req.headers['cf-connecting-ip'] as string | undefined) ?? req.ip ?? 'unknown'

  // Coarse backstop across the whole API so no single client can hammer
  // expensive endpoints (e.g. the outbound-fetch recipe import). Generous enough
  // for the wall tablet's polling + SSE; the strict login limiter sits on top.
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1200,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: clientIpKey,
      validate: { ip: false },
    }),
  )

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
      keyGenerator: clientIpKey,
      validate: { ip: false },
    }),
  )

  app.use('/api', apiRouter)

  // CalDAV server (spec §10 Phase 5.5) — lives outside /api; clients discover it
  // via /.well-known/caldav. Self-gates on the household toggle + app-password auth.
  // Any method (DAVx5 uses PROPFIND here, not GET) → redirect to the CalDAV root.
  app.all('/.well-known/caldav', (_req, res) => res.redirect(301, '/caldav/'))

  // Brute-force protection for CalDAV app passwords (HTTP Basic). Only failed
  // requests count (skipSuccessfulRequests), so a synced client's frequent
  // getctag/REPORT polling is never throttled — only repeated 401s are.
  app.use(
    '/caldav',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      skipSuccessfulRequests: true,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: clientIpKey,
      validate: { ip: false },
    }),
  )
  app.use('/caldav', caldavRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
