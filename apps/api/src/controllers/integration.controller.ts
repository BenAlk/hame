import type { RequestHandler } from 'express'
import type {
  CreateIntegrationInput,
  TestIntegrationInput,
  UpdateIntegrationInput,
} from '@hame/shared'
import {
  createIntegration,
  deleteIntegration,
  getIntegration,
  listIntegrations,
  listProviders,
  listStatusIntegrations,
  pollIntegration,
  testIntegration,
  updateIntegration,
} from '../services/integration.service.js'

/** The catalogue of registered providers for the "add integration" picker. */
export const listProvidersController: RequestHandler = (_req, res) => {
  res.json(listProviders())
}

/** Member-level: active STATUS snapshots for the dashboard widget (no secrets/config). */
export const listStatusController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listStatusIntegrations())
  } catch (err) {
    next(err)
  }
}

export const listIntegrationsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listIntegrations())
  } catch (err) {
    next(err)
  }
}

export const getIntegrationController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getIntegration(req.params.id))
  } catch (err) {
    next(err)
  }
}

export const createIntegrationController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createIntegration(req.body as CreateIntegrationInput))
  } catch (err) {
    next(err)
  }
}

export const updateIntegrationController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateIntegration(req.params.id, req.body as UpdateIntegrationInput))
  } catch (err) {
    next(err)
  }
}

export const deleteIntegrationController: RequestHandler = async (req, res, next) => {
  try {
    await deleteIntegration(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

/** Probe a (possibly unsaved) provider + config + secret before committing it. */
export const testIntegrationController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await testIntegration(req.body as TestIntegrationInput))
  } catch (err) {
    next(err)
  }
}

/** Refresh one integration's cached data now (the per-card "Sync now"). */
export const syncIntegrationController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await pollIntegration(req.params.id))
  } catch (err) {
    next(err)
  }
}
