import type { RequestHandler } from 'express'
import type { CreateBinInput, CreateScraperBinsInput, UpdateBinInput } from '@hame/shared'
import {
  createBin,
  createScraperBins,
  deleteBin,
  getBin,
  listBins,
  listScraperAddressBins,
  listScraperCouncils,
  searchScraperAddresses,
  syncBin,
  updateBin,
} from '../services/bin.service.js'

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

/** Refresh an external bin's cached collection dates on demand (spec §10 Phase 5.6). */
export const syncBinController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await syncBin(req.params.id))
  } catch (err) {
    next(err)
  }
}

/** Councils the scraper supports — drives the bin form's source picker. */
export const listScraperCouncilsController: RequestHandler = (_req, res, next) => {
  try {
    res.json(listScraperCouncils())
  } catch (err) {
    next(err)
  }
}

/** Address lookup for a council (live) — drives the bin form's address search. */
export const searchScraperAddressesController: RequestHandler = async (req, res, next) => {
  try {
    const councilId = typeof req.query.councilId === 'string' ? req.query.councilId : ''
    const q = typeof req.query.q === 'string' ? req.query.q : ''
    res.json(await searchScraperAddresses(councilId, q))
  } catch (err) {
    next(err)
  }
}

/** Bins listed at a resolved address (live) — drives the "which bin" picker. */
export const listScraperAddressBinsController: RequestHandler = async (req, res, next) => {
  try {
    const councilId = typeof req.query.councilId === 'string' ? req.query.councilId : ''
    const addressId = typeof req.query.addressId === 'string' ? req.query.addressId : ''
    res.json(await listScraperAddressBins(councilId, addressId))
  } catch (err) {
    next(err)
  }
}

/** Create every chosen bin for one scraped address in a single call (spec §12). */
export const createScraperBinsController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createScraperBins(req.body as CreateScraperBinsInput))
  } catch (err) {
    next(err)
  }
}
