import type { RequestHandler } from 'express'
import type { TestHomeAssistantInput, UpdateHomeAssistantConfigInput } from '@hame/shared'
import {
  getHomeAssistantConfig,
  testHomeAssistant,
  updateHomeAssistantConfig,
} from '../services/home-assistant-config.service.js'

export const getHomeAssistantConfigController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getHomeAssistantConfig())
  } catch (err) {
    next(err)
  }
}

export const updateHomeAssistantConfigController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateHomeAssistantConfig(req.body as UpdateHomeAssistantConfigInput))
  } catch (err) {
    next(err)
  }
}

export const testHomeAssistantController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await testHomeAssistant(req.body as TestHomeAssistantInput))
  } catch (err) {
    next(err)
  }
}
