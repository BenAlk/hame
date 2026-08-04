import type { RequestHandler } from 'express'
import type { LoginInput } from '@hame/shared'
import { login } from '../services/auth.service.js'
import { signSessionToken } from '../lib/token.js'
import {
  clearSessionCookie,
  generateCsrfToken,
  setCsrfCookie,
  setSessionCookie,
} from '../lib/cookies.js'

export const loginController: RequestHandler = async (req, res, next) => {
  try {
    const { username, password, trustDevice } = req.body as LoginInput
    const user = await login(username, password)

    const token = await signSessionToken({
      sub: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      trusted: trustDevice,
    })
    setSessionCookie(res, token)
    // Refresh the CSRF token alongside the new session.
    setCsrfCookie(res, generateCsrfToken())

    res.json(user)
  } catch (err) {
    next(err)
  }
}

export const logoutController: RequestHandler = (_req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
}

export const meController: RequestHandler = (req, res) => {
  // requireAuth guarantees req.user is set.
  res.json(req.user)
}
