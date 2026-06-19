import { Router } from 'express'
import { CreateUserSchema, UpdateProfileSchema, UpdateUserSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createUserController,
  deleteUserController,
  listMembersController,
  listUsersController,
  updateProfileController,
  updateUserController,
} from '../controllers/users.controller.js'

export const usersRouter = Router()

usersRouter.get('/', requireAuth, requireAdmin, listUsersController)

// Roster for assignment pickers — any member, minimal fields. Before "/:id".
usersRouter.get('/members', requireAuth, listMembersController)

usersRouter.post(
  '/',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(CreateUserSchema),
  createUserController,
)

// Self-service profile edit. Registered before "/:id" so "me" isn't captured.
usersRouter.patch(
  '/me',
  requireAuth,
  verifyCsrf,
  validateBody(UpdateProfileSchema),
  updateProfileController,
)

usersRouter.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(UpdateUserSchema),
  updateUserController,
)

usersRouter.delete('/:id', requireAuth, requireAdmin, verifyCsrf, deleteUserController)
