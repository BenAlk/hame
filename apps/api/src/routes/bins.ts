import { Router } from 'express'
import { CreateBinSchema, UpdateBinSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createBinController,
  deleteBinController,
  getBinController,
  listBinsController,
  updateBinController,
} from '../controllers/bins.controller.js'

export const binsRouter = Router()

binsRouter.get('/', requireAuth, listBinsController)
binsRouter.get('/:id', requireAuth, getBinController)
binsRouter.post('/', requireAuth, verifyCsrf, validateBody(CreateBinSchema), createBinController)
binsRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateBinSchema),
  updateBinController,
)
binsRouter.delete('/:id', requireAuth, verifyCsrf, deleteBinController)
