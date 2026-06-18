import type { RequestHandler } from 'express'
import type { CreateStorageLocationInput, UpdateStorageLocationInput } from '@hame/shared'
import {
  createStorageLocation,
  deleteStorageLocation,
  listStorageLocations,
  updateStorageLocation,
} from '../services/storage-location.service.js'

export const listStorageLocationsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listStorageLocations())
  } catch (err) {
    next(err)
  }
}

export const createStorageLocationController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createStorageLocation(req.body as CreateStorageLocationInput))
  } catch (err) {
    next(err)
  }
}

export const updateStorageLocationController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateStorageLocation(req.params.id, req.body as UpdateStorageLocationInput))
  } catch (err) {
    next(err)
  }
}

export const deleteStorageLocationController: RequestHandler = async (req, res, next) => {
  try {
    await deleteStorageLocation(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
