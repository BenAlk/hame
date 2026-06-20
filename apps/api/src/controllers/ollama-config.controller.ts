import type { RequestHandler } from 'express'
import type { ProbeOllamaInput, UpdateOllamaConfigInput } from '@hame/shared'
import {
  getOllamaConfig,
  probeOllamaModels,
  updateOllamaConfig,
} from '../services/ollama-config.service.js'

export const getOllamaConfigController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getOllamaConfig())
  } catch (err) {
    next(err)
  }
}

export const updateOllamaConfigController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateOllamaConfig(req.body as UpdateOllamaConfigInput))
  } catch (err) {
    next(err)
  }
}

export const probeOllamaModelsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await probeOllamaModels((req.body as ProbeOllamaInput).url))
  } catch (err) {
    next(err)
  }
}
