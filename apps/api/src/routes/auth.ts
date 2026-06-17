import { Router } from 'express'
import { LoginSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import { loginController, logoutController, meController } from '../controllers/auth.controller.js'

export const authRouter = Router()

// POST /api/auth/login — exempt from CSRF (no session yet; rate-limited).
authRouter.post('/login', validateBody(LoginSchema), loginController)

// POST /api/auth/logout — authenticated, state-changing → CSRF-protected.
authRouter.post('/logout', requireAuth, verifyCsrf, logoutController)

// GET /api/auth/me — current user.
authRouter.get('/me', requireAuth, meController)
