import type { RequestHandler } from 'express'
import type { CreateCalDavCredentialInput } from '@hame/shared'
import {
  createCalDavCredential,
  deleteCalDavCredential,
  getCalDavConnection,
  listCalDavCredentials,
} from '../services/caldav-credential.service.js'

export const getCalDavConnectionController: RequestHandler = (_req, res, next) => {
  try {
    res.json(getCalDavConnection())
  } catch (err) {
    next(err)
  }
}

export const listCalDavCredentialsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await listCalDavCredentials(req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const createCalDavCredentialController: RequestHandler = async (req, res, next) => {
  try {
    const { label } = req.body as CreateCalDavCredentialInput
    res.status(201).json(await createCalDavCredential(req.user!.id, label))
  } catch (err) {
    next(err)
  }
}

export const deleteCalDavCredentialController: RequestHandler = async (req, res, next) => {
  try {
    await deleteCalDavCredential(req.user!.id, req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
