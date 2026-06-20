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
