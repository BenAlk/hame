import { z } from 'zod'
import { CreateUserSchema } from './user.js'

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginInput = z.infer<typeof LoginSchema>

/**
 * First-run setup: creates the initial admin. Role is forced to ADMIN
 * server-side, so it is intentionally omitted from the input here.
 */
export const SetupSchema = CreateUserSchema.omit({ role: true })
export type SetupInput = z.infer<typeof SetupSchema>

export const SetupStatusSchema = z.object({
  requiresSetup: z.boolean(),
})
export type SetupStatus = z.infer<typeof SetupStatusSchema>
