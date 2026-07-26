import { Router } from 'express'
import {
  BulkCreatePantryEntriesSchema,
  CreatePantryEntrySchema,
  UpdatePantryEntrySchema,
} from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createPantryEntriesController,
  createPantryEntryController,
  deletePantryEntryController,
  expiringSoonController,
  listPantryController,
  lowStockController,
  updatePantryEntryController,
} from '../controllers/pantry.controller.js'

export const pantryRouter = Router()

pantryRouter.get('/', requireAuth, listPantryController)
pantryRouter.get('/expiring-soon', requireAuth, expiringSoonController)
pantryRouter.get('/low-stock', requireAuth, lowStockController)
pantryRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreatePantryEntrySchema),
  createPantryEntryController,
)
pantryRouter.post(
  '/bulk',
  requireAuth,
  verifyCsrf,
  validateBody(BulkCreatePantryEntriesSchema),
  createPantryEntriesController,
)
pantryRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdatePantryEntrySchema),
  updatePantryEntryController,
)
pantryRouter.delete('/:id', requireAuth, verifyCsrf, deletePantryEntryController)
