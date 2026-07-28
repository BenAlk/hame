import type { RequestHandler } from 'express'
import type { CreateSectionInput, ReorderSectionsInput, UpdateSectionInput } from '@hame/shared'
import {
  createSection,
  deleteSection,
  listSections,
  reorderSections,
  updateSection,
} from '../services/section.service.js'

export const listSectionsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listSections())
  } catch (err) {
    next(err)
  }
}

export const createSectionController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createSection(req.body as CreateSectionInput))
  } catch (err) {
    next(err)
  }
}

export const updateSectionController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateSection(req.params.id, req.body as UpdateSectionInput))
  } catch (err) {
    next(err)
  }
}

export const reorderSectionsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await reorderSections(req.body as ReorderSectionsInput))
  } catch (err) {
    next(err)
  }
}

export const deleteSectionController: RequestHandler = async (req, res, next) => {
  try {
    await deleteSection(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
