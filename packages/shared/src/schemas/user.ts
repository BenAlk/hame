import { z } from 'zod'
import { HEX_COLOUR_REGEX, ROLES } from '../constants/index.js'

export const RoleSchema = z.enum(ROLES)

/** Fields a user (or admin) may set when creating an account. */
export const CreateUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-z0-9_-]+$/i, 'Letters, numbers, hyphens and underscores only'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  surname: z.string().min(1, 'Surname is required'),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Must be a hex colour, e.g. #3B82F6'),
  dob: z.coerce.date(),
  role: RoleSchema.optional(),
})
export type CreateUserInput = z.infer<typeof CreateUserSchema>

/** At least one updatable field must be present. */
const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

/** Profile fields any user may change about themselves (role excluded by design). */
const ProfileFields = z.object({
  firstName: z.string().min(1).optional(),
  surname: z.string().min(1).optional(),
  colour: z.string().regex(HEX_COLOUR_REGEX).optional(),
  avatarUrl: z.string().url().nullish(),
  password: z.string().min(8).optional(),
  dob: z.coerce.date().optional(),
})

/** Fields a member may update on their own profile. */
export const UpdateProfileSchema = ProfileFields.refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>

/**
 * Fields an admin may update on any user — the profile fields plus an optional
 * role change. Members use {@link UpdateProfileSchema} (role excluded by design).
 */
export const UpdateUserSchema = ProfileFields.extend({
  role: RoleSchema.optional(),
}).refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>

/** Minimal user shape for "who added/completed this" attribution (with colour). */
export const MemberSummarySchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  colour: z.string(),
})
export type MemberSummary = z.infer<typeof MemberSummarySchema>

/** Public-safe representation of a user (never includes the password hash). */
export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  firstName: z.string(),
  surname: z.string(),
  avatarUrl: z.string().nullable(),
  colour: z.string(),
  dob: z.coerce.date(),
  role: RoleSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type PublicUser = z.infer<typeof PublicUserSchema>
