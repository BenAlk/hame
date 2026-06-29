import type { RequestHandler } from 'express'
import type { TestImmichInput, UpdateImmichConfigInput } from '@hame/shared'
import {
  getImmichConfig,
  listImmichAlbums,
  testImmich,
  updateImmichConfig,
} from '../services/immich-config.service.js'

/** Immich connection config feeding the idle screensaver (spec §10 Phase 7.3).
 *  The API key is encrypted at rest and never returned — only `hasApiKey`. */
export const getImmichConfigController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getImmichConfig())
  } catch (err) {
    next(err)
  }
}

export const updateImmichConfigController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateImmichConfig(req.body as UpdateImmichConfigInput))
  } catch (err) {
    next(err)
  }
}

export const testImmichController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await testImmich(req.body as TestImmichInput))
  } catch (err) {
    next(err)
  }
}

export const listImmichAlbumsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listImmichAlbums())
  } catch (err) {
    next(err)
  }
}
