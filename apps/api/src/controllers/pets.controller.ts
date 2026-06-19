import type { RequestHandler } from 'express'
import type { CreatePetInput, UpdatePetInput } from '@hame/shared'
import { createPet, deletePet, getPet, listPets, updatePet } from '../services/pet.service.js'

export const listPetsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listPets())
  } catch (err) {
    next(err)
  }
}

export const getPetController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getPet(req.params.id))
  } catch (err) {
    next(err)
  }
}

export const createPetController: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await createPet(req.body as CreatePetInput))
  } catch (err) {
    next(err)
  }
}

export const updatePetController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updatePet(req.params.id, req.body as UpdatePetInput))
  } catch (err) {
    next(err)
  }
}

export const deletePetController: RequestHandler = async (req, res, next) => {
  try {
    await deletePet(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
