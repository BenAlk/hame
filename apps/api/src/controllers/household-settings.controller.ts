import type { RequestHandler } from 'express'
import type { UpdateHouseholdSettingsInput } from '@hame/shared'
import {
  getHouseholdSettings,
  updateHouseholdSettings,
} from '../services/household-settings.service.js'

export const getHouseholdSettingsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getHouseholdSettings())
  } catch (err) {
    next(err)
  }
}

export const updateHouseholdSettingsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateHouseholdSettings(req.body as UpdateHouseholdSettingsInput))
  } catch (err) {
    next(err)
  }
}
