import type { RequestHandler } from 'express'
import type { CreateNoteInput, UpdateNoteInput } from '@hame/shared'
import {
  createNote,
  deleteNote,
  dismissNote,
  listNotesForViewer,
  updateNote,
} from '../services/note.service.js'

export const listNotesController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await listNotesForViewer(req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const createNoteController: RequestHandler = async (req, res, next) => {
  try {
    const author = { id: req.user!.id, role: req.user!.role }
    res.status(201).json(await createNote(req.body as CreateNoteInput, author))
  } catch (err) {
    next(err)
  }
}

export const updateNoteController: RequestHandler = async (req, res, next) => {
  try {
    const viewer = { id: req.user!.id, role: req.user!.role }
    res.json(await updateNote(req.params.id, req.body as UpdateNoteInput, viewer))
  } catch (err) {
    next(err)
  }
}

export const deleteNoteController: RequestHandler = async (req, res, next) => {
  try {
    await deleteNote(req.params.id, { id: req.user!.id, role: req.user!.role })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export const dismissNoteController: RequestHandler = async (req, res, next) => {
  try {
    await dismissNote(req.params.id, req.user!.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
