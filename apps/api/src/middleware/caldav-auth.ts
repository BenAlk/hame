import type { RequestHandler } from 'express'
import { verifyCalDavAuth } from '../services/caldav-credential.service.js'

const REALM = 'Hame CalDAV'

function unauthorized(res: Parameters<RequestHandler>[1]): void {
  res.set('WWW-Authenticate', `Basic realm="${REALM}"`).status(401).end()
}

/**
 * HTTP Basic auth for the CalDAV server (spec §10 Phase 5.5). CalDAV clients
 * (e.g. DAVx5) don't use Hame's session cookie, so they authenticate with the
 * user's username + a CalDAV app password. On success the user id is attached as
 * `req.caldavUserId`; otherwise a 401 with a `WWW-Authenticate` challenge.
 */
export const caldavAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Basic ')) return unauthorized(res)

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  const sep = decoded.indexOf(':')
  if (sep === -1) return unauthorized(res)
  const username = decoded.slice(0, sep)
  const password = decoded.slice(sep + 1)

  verifyCalDavAuth(username, password)
    .then((result) => {
      if (!result) return unauthorized(res)
      req.caldavUserId = result.userId
      next()
    })
    .catch(next)
}
