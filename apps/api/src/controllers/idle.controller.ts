import type { RequestHandler } from 'express'
import type { IdlePhotos, UpdateIdleModeSettingsInput } from '@hame/shared'
import { getIdleModeSettings, updateIdleModeSettings } from '../services/idle-mode.service.js'
import { getIdleAssetIds, getPhoto } from '../services/immich-config.service.js'

/** Household idle/screensaver settings (spec §8.14, §10 Phase 7.3). Member read
 *  so the shared wall tablet can apply them; admin-only write at the route. */
export const getIdleSettingsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getIdleModeSettings())
  } catch (err) {
    next(err)
  }
}

export const updateIdleSettingsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateIdleModeSettings(req.body as UpdateIdleModeSettingsInput))
  } catch (err) {
    next(err)
  }
}

/**
 * The pool of asset ids the screensaver cycles. Empty when photos are turned off
 * (`immichEnabled`) or Immich isn't configured — the screensaver then shows
 * clock-only. The shuffle preference is applied server-side from the settings.
 */
export const getIdlePhotosController: RequestHandler = async (_req, res, next) => {
  try {
    const settings = await getIdleModeSettings()
    const assetIds = settings.immichEnabled ? await getIdleAssetIds(settings.shufflePhotos) : []
    const payload: IdlePhotos = { assetIds }
    res.json(payload)
  } catch (err) {
    next(err)
  }
}

/**
 * Proxy one asset's preview bytes from Immich (spec §8.14 "Backend Proxy") — the
 * Immich credential never reaches the browser. Cached briefly so re-showing a
 * photo in the cycle doesn't re-hit Immich.
 */
export const getIdlePhotoController: RequestHandler = async (req, res, next) => {
  try {
    const { contentType, body } = await getPhoto(req.params.id)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.send(body)
  } catch (err) {
    next(err)
  }
}
