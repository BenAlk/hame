import type { RequestHandler } from 'express'
import type { CompleteInstanceInput, CreateChoreInput, UpdateChoreInput } from '@hame/shared'
import {
  completeInstance,
  createChore,
  deleteChore,
  getChore,
  listChoreInstances,
  listChores,
  uncompleteInstance,
  updateChore,
} from '../services/chore.service.js'

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export const listChoresController: RequestHandler = async (req, res, next) => {
  try {
    const active =
      req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined
    res.json(await listChores({ active }))
  } catch (err) {
    next(err)
  }
}

export const getChoreController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getChore(req.params.id))
  } catch (err) {
    next(err)
  }
}

export const createChoreController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createChore(req.body as CreateChoreInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const updateChoreController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateChore(req.params.id, req.body as UpdateChoreInput))
  } catch (err) {
    next(err)
  }
}

export const deleteChoreController: RequestHandler = async (req, res, next) => {
  try {
    await deleteChore(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

// ── Instances ────────────────────────────────────────────────────────────────

export const listChoreInstancesController: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await listChoreInstances({
        due: req.query.due === 'today' ? 'today' : undefined,
        from: parseDate(req.query.from),
        to: parseDate(req.query.to),
        petId: typeof req.query.petId === 'string' ? req.query.petId : undefined,
      }),
    )
  } catch (err) {
    next(err)
  }
}

export const completeInstanceController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await completeInstance(req.params.id, req.body as CompleteInstanceInput, req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const uncompleteInstanceController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await uncompleteInstance(req.params.id))
  } catch (err) {
    next(err)
  }
}
