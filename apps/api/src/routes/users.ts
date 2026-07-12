import { Router } from 'express'
import { CreateUserSchema, UpdateProfileSchema, UpdateUserSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import {
  createTabletController,
  createUserController,
  deleteUserController,
  getTabletAccountController,
  listMembersController,
  listUsersController,
  resetTabletController,
  updateProfileController,
  updateUserController,
} from '../controllers/users.controller.js'

export const usersRouter = Router()

usersRouter.get('/', requireAuth, requireAdmin, listUsersController)

// Roster for assignment pickers — any member, minimal fields. Before "/:id".
usersRouter.get('/members', requireAuth, listMembersController)

// Wall-tablet account management (spec §8.1) — admin-only, before "/:id" so the
// literal "tablet" path isn't captured as an id.
usersRouter.get('/tablet', requireAuth, requireAdmin, getTabletAccountController)
usersRouter.post('/tablet', requireAuth, requireAdmin, verifyCsrf, createTabletController)
usersRouter.post('/tablet/reset', requireAuth, requireAdmin, verifyCsrf, resetTabletController)

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
