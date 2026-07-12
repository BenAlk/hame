import { Router } from 'express'
import { CreateNoteSchema, UpdateNoteSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createNoteController,
  deleteNoteController,
  dismissNoteController,
  listNotesController,
  updateNoteController,
} from '../controllers/notes.controller.js'

export const notesRouter = Router()

notesRouter.get('/', requireAuth, listNotesController)
notesRouter.post('/', requireAuth, verifyCsrf, validateBody(CreateNoteSchema), createNoteController)
notesRouter.patch(
  '/:id',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateNoteSchema),
  updateNoteController,
)
notesRouter.delete('/:id', requireAuth, verifyCsrf, deleteNoteController)
notesRouter.post('/:id/dismiss', requireAuth, verifyCsrf, dismissNoteController)
