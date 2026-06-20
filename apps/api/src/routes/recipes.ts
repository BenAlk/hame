import { Router } from 'express'
import { CreateRecipeSchema, ImportRecipeSchema, UpdateRecipeSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createRecipeController,
  deleteRecipeController,
  getRecipeController,
  importRecipeController,
  listRecipesController,
  updateRecipeController,
} from '../controllers/recipes.controller.js'

export const recipesRouter = Router()

recipesRouter.get('/', requireAuth, listRecipesController)
recipesRouter.post(
  '/import',
  requireAuth,
  verifyCsrf,
  validateBody(ImportRecipeSchema),
  importRecipeController,
)
recipesRouter.get('/:id', requireAuth, getRecipeController)
recipesRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreateRecipeSchema),
  createRecipeController,
)
recipesRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateRecipeSchema),
  updateRecipeController,
)
recipesRouter.delete('/:id', requireAuth, verifyCsrf, deleteRecipeController)
