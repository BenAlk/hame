import type { RequestHandler } from 'express'
import type { CreateCustomEventInput, UpdateCustomEventInput } from '@hame/shared'
import {
  createCustomEvent,
  deleteCustomEvent,
  listCustomEvents,
  updateCustomEvent,
} from '../services/custom-event.service.js'

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export const listCustomEventsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await listCustomEvents({ from: parseDate(req.query.from), to: parseDate(req.query.to) }),
    )
  } catch (err) {
    next(err)
  }
}

export const createCustomEventController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createCustomEvent(req.body as CreateCustomEventInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const updateCustomEventController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateCustomEvent(req.params.id, req.body as UpdateCustomEventInput))
  } catch (err) {
    next(err)
  }
}

export const deleteCustomEventController: RequestHandler = async (req, res, next) => {
  try {
    await deleteCustomEvent(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
