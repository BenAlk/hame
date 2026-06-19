import { z } from 'zod'
import { SPECIES } from '../constants/index.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const SpeciesSchema = z.enum(SPECIES)

/** Fields shared by create and update. */
const PetFields = z.object({
  name: z.string().min(1, 'Pet name is required').max(60, 'Pet name is too long'),
  species: SpeciesSchema,
  breed: z.string().max(60).nullish(),
  dob: z.coerce.date().nullish(),
  imageUrl: z.string().url().nullish(),
})

export const CreatePetSchema = PetFields
export type CreatePetInput = z.infer<typeof CreatePetSchema>

export const UpdatePetSchema = PetFields.partial().refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdatePetInput = z.infer<typeof UpdatePetSchema>

/** Public representation of a pet. */
export const PetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  species: SpeciesSchema,
  breed: z.string().nullable(),
  dob: z.coerce.date().nullable(),
  imageUrl: z.string().nullable(),
  createdAt: z.coerce.date(),
})
export type Pet = z.infer<typeof PetSchema>

/** Minimal pet shape embedded in a chore ("this chore is for Rex"). */
export const PetSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  species: SpeciesSchema,
})
export type PetSummary = z.infer<typeof PetSummarySchema>
