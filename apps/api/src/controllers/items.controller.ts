import type { RequestHandler } from 'express'
import type { CreateItemInput, SuggestTagsInput, UpdateItemInput } from '@hame/shared'
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  suggestTags,
  updateItem,
} from '../services/item.service.js'

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

export const deleteItemController: RequestHandler = async (req, res, next) => {
  try {
    await deleteItem(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
