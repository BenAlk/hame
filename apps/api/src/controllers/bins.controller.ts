import type { RequestHandler } from 'express'
import type { CreateBinInput, UpdateBinInput } from '@hame/shared'
import { createBin, deleteBin, getBin, listBins, updateBin } from '../services/bin.service.js'

export const listBinsController: RequestHandler = async (req, res, next) => {
  try {
    const active =
      req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined
    res.json(await listBins({ active }))
  } catch (err) {
    next(err)
  }
}

export const getBinController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getBin(req.params.id))
  } catch (err) {
    next(err)
  }
}

export const createBinController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createBin(req.body as CreateBinInput))
  } catch (err) {
    next(err)
  }
}

export const updateBinController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateBin(req.params.id, req.body as UpdateBinInput))
  } catch (err) {
    next(err)
  }
}

export const deleteBinController: RequestHandler = async (req, res, next) => {
  try {
    await deleteBin(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
