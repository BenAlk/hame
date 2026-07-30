import type { RequestHandler } from 'express'
import type {
  CreateItemInput,
  SuggestSectionInput,
  SuggestTagsInput,
  UpdateItemInput,
} from '@hame/shared'
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  suggestSection,
  suggestTags,
  updateItem,
} from '../services/item.service.js'
import { warmUpNormaliser } from '../services/normaliser.service.js'

export const listItemsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await listItems({ quickAdd: req.query.quickAdd === 'true' }))
  } catch (err) {
    next(err)
  }
}

export const getItemController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getItem(req.params.id))
  } catch (err) {
    next(err)
  }
}

export const createItemController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createItem(req.body as CreateItemInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const updateItemController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateItem(req.params.id, req.body as UpdateItemInput))
  } catch (err) {
    next(err)
  }
}

export const suggestTagsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await suggestTags((req.body as SuggestTagsInput).name))
  } catch (err) {
    next(err)
  }
}

export const suggestSectionController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await suggestSection((req.body as SuggestSectionInput).name))
  } catch (err) {
    next(err)
  }
}

/**
 * Preload the model behind the suggest endpoints (spec §10 Phase 19). The twin of
 * the recipe-import warm-up, and needed for the same reason: a cold Ollama loads
 * several GB, which overruns the short budget a suggestion gets, so the *first*
 * tap of a session would otherwise come back empty. Fired when a page carrying a
 * suggest affordance mounts, so the load overlaps with reading the page.
 *
 * 202 once kicked off; a no-op for non-LLM strategies.
 */
export const warmUpSuggestionsController: RequestHandler = async (_req, res, next) => {
  try {
    await warmUpNormaliser()
    res.status(202).end()
  } catch (err) {
    next(err)
  }
}

export const deleteItemController: RequestHandler = async (req, res, next) => {
  try {
    await deleteItem(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
