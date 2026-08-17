import type { RequestHandler } from 'express'
import type { UpdateSleepModeSettingsInput } from '@hame/shared'
import { getSleepModeSettings, updateSleepModeSettings } from '../services/sleep-mode.service.js'

/** Household sleep-mode schedule (spec §8.14a, §10 Phase 26). Member read so
 *  the shared wall tablet can apply it; admin-only write at the route. */
export const getSleepModeSettingsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getSleepModeSettings())
  } catch (err) {
    next(err)
  }
}

export const updateSleepModeSettingsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateSleepModeSettings(req.body as UpdateSleepModeSettingsInput))
  } catch (err) {
    next(err)
  }
}
