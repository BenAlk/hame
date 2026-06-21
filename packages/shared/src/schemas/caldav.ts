import { z } from 'zod'

/** Mint a new CalDAV app password — the user just labels which device it's for. */
export const CreateCalDavCredentialSchema = z.object({
  label: z.string().min(1, 'Name the device').max(60, 'Name is too long'),
})
export type CreateCalDavCredentialInput = z.infer<typeof CreateCalDavCredentialSchema>

/** Public shape of a stored credential — never includes the password. */
export const CalDavCredentialSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  lastUsedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})
export type CalDavCredential = z.infer<typeof CalDavCredentialSchema>

/** Returned only once, at creation: the credential plus its plaintext password. */
export const CalDavCredentialCreatedSchema = CalDavCredentialSchema.extend({
  /** The generated app password — shown once, never retrievable again. */
  password: z.string(),
})
export type CalDavCredentialCreated = z.infer<typeof CalDavCredentialCreatedSchema>

/** Where CalDAV clients should connect — shown in the app's setup panel. */
export const CalDavConnectionSchema = z.object({
  /** Configured public/domain base URL (env `CALDAV_PUBLIC_URL`), if any. */
  publicUrl: z.string().nullable(),
  /** The server's detected LAN IPv4, for local-network use, if any. */
  lanAddress: z.string().nullable(),
})
export type CalDavConnection = z.infer<typeof CalDavConnectionSchema>
