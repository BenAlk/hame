import type { RequestHandler } from 'express'
import type { CreateShopInput, UpdateShopInput } from '@hame/shared'
import { createShop, deleteShop, listShops, updateShop } from '../services/shop.service.js'

export const listShopsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listShops())
  } catch (err) {
    next(err)
  }
}

export const createShopController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createShop(req.body as CreateShopInput))
  } catch (err) {
    next(err)
  }
}

export const updateShopController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateShop(req.params.id, req.body as UpdateShopInput))
  } catch (err) {
    next(err)
  }
}

export const deleteShopController: RequestHandler = async (req, res, next) => {
  try {
    await deleteShop(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
