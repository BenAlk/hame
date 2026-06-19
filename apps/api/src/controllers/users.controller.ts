import type { RequestHandler } from 'express'
import type { CreateUserInput, UpdateProfileInput, UpdateUserInput } from '@hame/shared'
import {
  adminUpdateUser,
  createUser,
  deleteUser,
  listMembers,
  listUsers,
  updateProfile,
} from '../services/user.service.js'

export const listUsersController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listUsers())
  } catch (err) {
    next(err)
  }
}

/** GET /api/users/members — non-sensitive roster for assignment pickers. */
export const listMembersController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listMembers())
  } catch (err) {
    next(err)
  }
}

export const createUserController: RequestHandler = async (req, res, next) => {
  try {
    const user = await createUser(req.body as CreateUserInput)
    res.status(201).json(user)
  } catch (err) {
    next(err)
  }
}

/** PATCH /api/users/me — the authenticated user editing their own profile. */
export const updateProfileController: RequestHandler = async (req, res, next) => {
  try {
    const user = await updateProfile(req.user!.id, req.body as UpdateProfileInput)
    res.json(user)
  } catch (err) {
    next(err)
  }
}

/** PATCH /api/users/:id — admin editing any user (incl. role). */
export const updateUserController: RequestHandler = async (req, res, next) => {
  try {
    const user = await adminUpdateUser(req.params.id, req.body as UpdateUserInput)
    res.json(user)
  } catch (err) {
    next(err)
  }
}

export const deleteUserController: RequestHandler = async (req, res, next) => {
  try {
    await deleteUser(req.user!.id, req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
