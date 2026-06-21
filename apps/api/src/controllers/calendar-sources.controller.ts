import type { RequestHandler } from 'express'
import type { CreateCalendarSourceInput, UpdateCalendarSourceInput } from '@hame/shared'
import {
  createCalendarSource,
  deleteCalendarSource,
  listCalendarSources,
  syncCalendarSource,
  updateCalendarSource,
} from '../services/calendar-source.service.js'

export const listCalendarSourcesController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listCalendarSources())
  } catch (err) {
    next(err)
  }
}

export const createCalendarSourceController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createCalendarSource(req.body as CreateCalendarSourceInput))
  } catch (err) {
    next(err)
  }
}

export const updateCalendarSourceController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateCalendarSource(req.params.id, req.body as UpdateCalendarSourceInput))
  } catch (err) {
    next(err)
  }
}

export const deleteCalendarSourceController: RequestHandler = async (req, res, next) => {
  try {
    await deleteCalendarSource(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export const syncCalendarSourceController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await syncCalendarSource(req.params.id))
  } catch (err) {
    next(err)
  }
}
