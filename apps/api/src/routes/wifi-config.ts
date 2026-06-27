import { Router } from 'express'
import { UpdateWifiConfigSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  getWifiConfigController,
  updateWifiConfigController,
} from '../controllers/wifi-config.controller.js'

export const wifiConfigRouter = Router()

// Member-level read — feeds the WiFi QR widget (household data shown openly on
// the wall tablet, like the HA entity reads). Admin-only write, since it holds a
// secret encrypted at rest (spec §11).
wifiConfigRouter.get('/', requireAuth, getWifiConfigController)
wifiConfigRouter.patch(
  '/',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(UpdateWifiConfigSchema),
  updateWifiConfigController,
)
