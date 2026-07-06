import { Router } from 'express'
import {
  ClearMealPlanSchema,
  CreateMealPlanEntrySchema,
  GenerateMealPlanSchema,
  GenerateShoppingListSchema,
  PreviewShoppingListSchema,
  UpdateMealPlanEntrySchema,
} from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  clearMealPlanController,
  createMealPlanEntryController,
  deleteMealPlanEntryController,
  generateMealPlanController,
  generateShoppingListController,
  listMealPlanEntriesController,
  previewShoppingListController,
  updateMealPlanEntryController,
} from '../controllers/meal-plans.controller.js'

export const mealPlansRouter = Router()

mealPlansRouter.get('/', requireAuth, listMealPlanEntriesController)
mealPlansRouter.post(
  '/preview-shopping-list',
  requireAuth,
  verifyCsrf,
  validateBody(PreviewShoppingListSchema),
  previewShoppingListController,
)
mealPlansRouter.post(
  '/generate-shopping-list',
  requireAuth,
  verifyCsrf,
  validateBody(GenerateShoppingListSchema),
  generateShoppingListController,
)
mealPlansRouter.post(
  '/generate',
  requireAuth,
  verifyCsrf,
  validateBody(GenerateMealPlanSchema),
  generateMealPlanController,
)
mealPlansRouter.post(
  '/clear',
  requireAuth,
  verifyCsrf,
  validateBody(ClearMealPlanSchema),
  clearMealPlanController,
)
mealPlansRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(CreateMealPlanEntrySchema),
  createMealPlanEntryController,
)
mealPlansRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateMealPlanEntrySchema),
  updateMealPlanEntryController,
)
mealPlansRouter.delete('/:id', requireAuth, verifyCsrf, deleteMealPlanEntryController)
