import type { RequestHandler } from 'express'
import type { SetConsumableInput, UpdateConsumableInput } from '@hame/shared'
import {
  listConsumables,
  removeConsumable,
  setConsumable,
  updateConsumable,
} from '../services/consumables.service.js'

export const listConsumablesController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listConsumables())
  } catch (err) {
    next(err)
  }
}

export const setConsumableController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await setConsumable(req.body as SetConsumableInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const updateConsumableController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateConsumable(req.params.itemId, req.body as UpdateConsumableInput))
  } catch (err) {
    next(err)
  }
}

export const removeConsumableController: RequestHandler = async (req, res, next) => {
  try {
    await removeConsumable(req.params.itemId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
