import type { RequestHandler } from 'express'
import type { CreatePantryEntryInput, UpdatePantryEntryInput } from '@hame/shared'
import {
  createPantryEntry,
  deletePantryEntry,
  listExpiringSoon,
  listLowStock,
  listPantryEntries,
  updatePantryEntry,
} from '../services/pantry.service.js'

export const listPantryController: RequestHandler = async (req, res, next) => {
  try {
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined
    res.json(await listPantryEntries({ locationId }))
  } catch (err) {
    next(err)
  }
}

export const expiringSoonController: RequestHandler = async (req, res, next) => {
  try {
    const days = typeof req.query.days === 'string' ? Number(req.query.days) : undefined
    res.json(await listExpiringSoon(Number.isFinite(days) ? days : undefined))
  } catch (err) {
    next(err)
  }
}

export const lowStockController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listLowStock())
  } catch (err) {
    next(err)
  }
}

export const createPantryEntryController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createPantryEntry(req.body as CreatePantryEntryInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const updatePantryEntryController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updatePantryEntry(req.params.id, req.body as UpdatePantryEntryInput))
  } catch (err) {
    next(err)
  }
}

export const deletePantryEntryController: RequestHandler = async (req, res, next) => {
  try {
    await deletePantryEntry(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
