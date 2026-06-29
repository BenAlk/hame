import { z } from 'zod'

/**
 * Connection to a self-hosted Immich photo library (spec §8.14, §10 Phase 7.3).
 * A singleton mirroring the Home Assistant / WiFi config pattern — URL + an API
 * key. Like the HA token, the key is a secret: it is AES-256-GCM encrypted at
 * rest (spec §11) and **never** leaves the API, so the read shape below carries
 * only `hasApiKey`, never the key itself. The browser never gets Immich
 * credentials — the idle screensaver pulls photos through Hame's backend proxy
 * (spec §8.14), so it works remotely without exposing Immich.
 */

/** Public/read shape — safe to send to the client; never includes the API key. */
export const ImmichConfigSchema = z.object({
  url: z.string().nullable(),
  /** Whether an API key is stored, so the UI can show "key set" without it. */
  hasApiKey: z.boolean(),
  selectedAlbumIds: z.array(z.string()),
  isActive: z.boolean(),
  /** True once URL + key are present and active — the screensaver can use it. */
  configured: z.boolean(),
  lastConnectedAt: z.coerce.date().nullable(),
  updatedAt: z.coerce.date(),
})
export type ImmichConfig = z.infer<typeof ImmichConfigSchema>

/** Update the saved config. Omitting `apiKey` keeps the stored one. */
export const UpdateImmichConfigSchema = z.object({
  url: z.string().url('Enter a valid URL').max(300),
  apiKey: z.string().min(1).max(2000).optional(),
  selectedAlbumIds: z.array(z.string()).max(200).optional(),
  isActive: z.boolean().optional(),
})
export type UpdateImmichConfigInput = z.infer<typeof UpdateImmichConfigSchema>

/** Test an unsaved URL + key pair before committing it. */
export const TestImmichSchema = z.object({
  url: z.string().url('Enter a valid URL').max(300),
  apiKey: z.string().min(1, 'An API key is required to test').max(2000),
})
export type TestImmichInput = z.infer<typeof TestImmichSchema>

/** Result of probing an Immich server: reachability + reported version. */
export const ImmichTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  version: z.string().optional(),
})
export type ImmichTestResult = z.infer<typeof ImmichTestResultSchema>

/** One Immich album, for the Settings album picker. `assetCount` is best-effort. */
export const ImmichAlbumSchema = z.object({
  id: z.string(),
  name: z.string(),
  assetCount: z.number().int().nonnegative(),
})
export type ImmichAlbum = z.infer<typeof ImmichAlbumSchema>

/** The shuffled (or sequential) pool of asset ids the screensaver cycles. The
 *  bytes are fetched one at a time from `/api/idle/photo/:id` (backend proxy). */
export const IdlePhotosSchema = z.object({
  assetIds: z.array(z.string()),
})
export type IdlePhotos = z.infer<typeof IdlePhotosSchema>
