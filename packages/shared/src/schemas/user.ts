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
  name: z.string().min(1, 'Name is required'),
  colour: z.string().regex(HEX_COLOUR_REGEX, 'Must be a hex colour, e.g. #3B82F6'),
  dob: z.coerce.date(),
  role: RoleSchema.optional(),
})
export type CreateUserInput = z.infer<typeof CreateUserSchema>

/** Fields a member may update on their own profile (role excluded by design). */
export const UpdateProfileSchema = z
  .object({
    name: z.string().min(1).optional(),
    colour: z.string().regex(HEX_COLOUR_REGEX).optional(),
    avatarUrl: z.string().url().nullish(),
    password: z.string().min(8).optional(),
    dob: z.coerce.date().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>

/** Public-safe representation of a user (never includes the password hash). */
export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  colour: z.string(),
  dob: z.coerce.date(),
  role: RoleSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type PublicUser = z.infer<typeof PublicUserSchema>
