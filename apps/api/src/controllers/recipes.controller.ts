import type { RequestHandler } from 'express'
import type { CreateRecipeInput, ImportRecipeInput, UpdateRecipeInput } from '@hame/shared'
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  importRecipe,
  listRecipes,
  updateRecipe,
} from '../services/recipe.service.js'
import { warmUpNormaliser } from '../services/normaliser.service.js'

export const listRecipesController: RequestHandler = async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined
    res.json(await listRecipes({ search }))
  } catch (err) {
    next(err)
  }
}

export const getRecipeController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getRecipe(req.params.id))
  } catch (err) {
    next(err)
  }
}

export const createRecipeController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createRecipe(req.body as CreateRecipeInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const updateRecipeController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateRecipe(req.params.id, req.body as UpdateRecipeInput))
  } catch (err) {
    next(err)
  }
}

export const deleteRecipeController: RequestHandler = async (req, res, next) => {
  try {
    await deleteRecipe(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export const importRecipeController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await importRecipe((req.body as ImportRecipeInput).url))
  } catch (err) {
    next(err)
  }
}

/**
 * Preload the import normaliser's model (spec §10 Phase 4.5). Fired when the
 * user opens the import modal so Ollama's cold-load overlaps with their
 * think-time. Returns 202 once the warm-up is kicked off; a no-op for non-LLM
 * strategies.
 */
export const warmUpImportController: RequestHandler = async (_req, res, next) => {
  try {
    await warmUpNormaliser()
    res.status(202).end()
  } catch (err) {
    next(err)
  }
}
