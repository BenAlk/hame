import { Router } from 'express'
import { CreatePetSchema, UpdatePetSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createPetController,
  deletePetController,
  getPetController,
  listPetsController,
  updatePetController,
} from '../controllers/pets.controller.js'

export const petsRouter = Router()

petsRouter.get('/', requireAuth, listPetsController)
petsRouter.get('/:id', requireAuth, getPetController)
petsRouter.post('/', requireAuth, verifyCsrf, validateBody(CreatePetSchema), createPetController)
petsRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdatePetSchema),
  updatePetController,
)
petsRouter.delete('/:id', requireAuth, verifyCsrf, deletePetController)
