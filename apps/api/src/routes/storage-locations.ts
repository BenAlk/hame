import { Router } from 'express'
import { CreateStorageLocationSchema, UpdateStorageLocationSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createStorageLocationController,
  deleteStorageLocationController,
  listStorageLocationsController,
  updateStorageLocationController,
} from '../controllers/storage-locations.controller.js'

export const storageLocationsRouter = Router()

storageLocationsRouter.get('/', requireAuth, listStorageLocationsController)
storageLocationsRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreateStorageLocationSchema),
  createStorageLocationController,
)
storageLocationsRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateStorageLocationSchema),
  updateStorageLocationController,
)
storageLocationsRouter.delete('/:id', requireAuth, verifyCsrf, deleteStorageLocationController)
