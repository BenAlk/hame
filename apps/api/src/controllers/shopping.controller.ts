import type { RequestHandler } from 'express'
import type {
  AddShoppingItemInput,
  ArchiveShoppingListInput,
  CreateShoppingListInput,
  ListStatus,
  UpdateShoppingItemInput,
  UpdateShoppingListInput,
} from '@hame/shared'
import { LIST_STATUSES } from '@hame/shared'
import {
  addShoppingItem,
  archiveShoppingList,
  createShoppingList,
  deleteShoppingList,
  getShoppingList,
  listShoppingLists,
  removeShoppingItem,
  updateShoppingItem,
  updateShoppingList,
} from '../services/shopping.service.js'

function parseStatus(value: unknown): ListStatus | undefined {
  return typeof value === 'string' && (LIST_STATUSES as readonly string[]).includes(value)
    ? (value as ListStatus)
    : undefined
}

export const listShoppingListsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await listShoppingLists({ status: parseStatus(req.query.status) }))
  } catch (err) {
    next(err)
  }
}

export const getShoppingListController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getShoppingList(req.params.id))
  } catch (err) {
    next(err)
  }
}

export const createShoppingListController: RequestHandler = async (req, res, next) => {
  try {
    res
      .status(201)
      .json(await createShoppingList(req.body as CreateShoppingListInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const updateShoppingListController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateShoppingList(req.params.id, req.body as UpdateShoppingListInput))
  } catch (err) {
    next(err)
  }
}

export const deleteShoppingListController: RequestHandler = async (req, res, next) => {
  try {
    await deleteShoppingList(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export const archiveShoppingListController: RequestHandler = async (req, res, next) => {
  try {
    const result = await archiveShoppingList(
      req.params.id,
      req.body as ArchiveShoppingListInput,
      req.user!.id,
    )
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export const addShoppingItemController: RequestHandler = async (req, res, next) => {
  try {
    const row = await addShoppingItem(req.params.id, req.body as AddShoppingItemInput, req.user!.id)
    res.status(201).json(row)
  } catch (err) {
    next(err)
  }
}

export const updateShoppingItemController: RequestHandler = async (req, res, next) => {
  try {
    const row = await updateShoppingItem(
      req.params.id,
      req.params.itemId,
      req.body as UpdateShoppingItemInput,
    )
    res.json(row)
  } catch (err) {
    next(err)
  }
}

export const removeShoppingItemController: RequestHandler = async (req, res, next) => {
  try {
    await removeShoppingItem(req.params.id, req.params.itemId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
