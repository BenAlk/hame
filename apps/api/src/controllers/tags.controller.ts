import type { RequestHandler } from 'express'
import type { CreateTagInput, UpdateTagInput } from '@hame/shared'
import { createTag, deleteTag, listTags, updateTag } from '../services/tag.service.js'

export const listTagsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listTags())
  } catch (err) {
    next(err)
  }
}

export const createTagController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createTag(req.body as CreateTagInput))
  } catch (err) {
    next(err)
  }
}

export const updateTagController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateTag(req.params.id, req.body as UpdateTagInput))
  } catch (err) {
    next(err)
  }
}

export const deleteTagController: RequestHandler = async (req, res, next) => {
  try {
    await deleteTag(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
