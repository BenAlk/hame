import { Router } from 'express'
import { CreateBinSchema, CreateScraperBinsSchema, UpdateBinSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createBinController,
  createScraperBinsController,
  deleteBinController,
  getBinController,
  listBinsController,
  listScraperAddressBinsController,
  listScraperCouncilsController,
  searchScraperAddressesController,
  syncBinController,
  updateBinController,
} from '../controllers/bins.controller.js'

export const binsRouter = Router()

binsRouter.get('/', requireAuth, listBinsController)
// Scraper-setup lookups — declared before "/:id" so they aren't matched as an id.
binsRouter.get('/councils', requireAuth, listScraperCouncilsController)
binsRouter.get('/address-search', requireAuth, searchScraperAddressesController)
binsRouter.get('/source-bins', requireAuth, listScraperAddressBinsController)
binsRouter.post(
  '/scraper-batch',
  requireAuth,
  verifyCsrf,
  validateBody(CreateScraperBinsSchema),
  createScraperBinsController,
)
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
binsRouter.post('/:id/sync', requireAuth, verifyCsrf, syncBinController)
