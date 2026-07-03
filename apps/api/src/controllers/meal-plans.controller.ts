import type { RequestHandler } from 'express'
import type {
  CreateMealPlanEntryInput,
  GenerateShoppingListInput,
  PreviewShoppingListInput,
  UpdateMealPlanEntryInput,
} from '@hame/shared'
import {
  createMealPlanEntry,
  deleteMealPlanEntry,
  generateShoppingList,
  listMealPlanEntries,
  previewShoppingList,
  updateMealPlanEntry,
} from '../services/meal-plan.service.js'

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export const listMealPlanEntriesController: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await listMealPlanEntries({
        from: parseDate(req.query.from),
        to: parseDate(req.query.to),
      }),
    )
  } catch (err) {
    next(err)
  }
}

export const createMealPlanEntryController: RequestHandler = async (req, res, next) => {
  try {
    res
      .status(201)
      .json(await createMealPlanEntry(req.body as CreateMealPlanEntryInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const updateMealPlanEntryController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateMealPlanEntry(req.params.id, req.body as UpdateMealPlanEntryInput))
  } catch (err) {
    next(err)
  }
}

export const deleteMealPlanEntryController: RequestHandler = async (req, res, next) => {
  try {
    await deleteMealPlanEntry(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export const previewShoppingListController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await previewShoppingList(req.body as PreviewShoppingListInput))
  } catch (err) {
    next(err)
  }
}

export const generateShoppingListController: RequestHandler = async (req, res, next) => {
  try {
    res
      .status(201)
      .json(await generateShoppingList(req.body as GenerateShoppingListInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}
