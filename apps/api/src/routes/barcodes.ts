import { Router } from 'express'
import { LinkBarcodeSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  linkBarcodeController,
  resolveBarcodeController,
  unlinkBarcodeController,
} from '../controllers/barcodes.controller.js'

export const barcodesRouter = Router()

barcodesRouter.get('/:code', requireAuth, resolveBarcodeController)
barcodesRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(LinkBarcodeSchema),
  linkBarcodeController,
)
barcodesRouter.delete('/:code', requireAuth, verifyCsrf, unlinkBarcodeController)
