import { z } from 'zod'

/**
 * Backup & restore contract (spec §8.15, §9.8). A backup is a schema-aware
 * logical export of every database row — Hame stores no on-disk file assets, so
 * this is the whole household. The export is a single passphrase-encrypted file
 * (envelope below); import wipes and reloads into a version-matched instance.
 */

/** Bump when the payload shape changes incompatibly; import refuses a mismatch. */
export const BACKUP_FORMAT_VERSION = 1

/**
 * Every Prisma model, ordered **parents-first** so a restore can insert with
 * foreign keys already satisfied (delete/truncate uses the reverse). The order is
 * data, not derived, so it reads clearly and a coverage test (API) fails if a new
 * model is added without slotting it in here (spec §9.8) — the same "a change
 * fails a test" ethos as the bin-scraper fixtures and the QR encoder.
 */
export const BACKUP_MODELS = [
  // No foreign keys — the roots.
  'User',
  'Tag',
  'Pet',
  'StorageLocation',
  'BinCollection',
  'CalendarSource',
  // Reference the roots above.
  'Item',
  'ShoppingList',
  'Chore',
  'Recipe',
  'BinOccurrence',
  'CalendarObject',
  'SyncedEvent',
  'CalDavCredential',
  'DashboardLayout',
  'SmartHomeSettings',
  'NotificationPreference',
  // Reference the layer above.
  'ShoppingListItem',
  'PantryEntry',
  'ChoreInstance',
  'RecipeIngredient',
  'RecipeStep',
  'MealPlanEntry',
  // Config singletons — no foreign keys, grouped last.
  'HouseholdSettings',
  'OllamaConfig',
  'HomeAssistantConfig',
  'ImmichConfig',
  'IdleModeSettings',
  'WifiConfig',
] as const
export type BackupModelName = (typeof BACKUP_MODELS)[number]

/**
 * Prisma's implicit many-to-many join tables (`_<RelationName>`, columns `A`/`B`).
 * They aren't Prisma models, so they're captured separately and inserted **after**
 * every model (they reference two of them). A coverage test asserts this matches
 * the database's actual implicit-relation tables.
 */
export const BACKUP_JOIN_TABLES = [
  '_ItemTags',
  '_RecipeTags',
  '_ChoreTags',
  '_ChoreRotation',
] as const
export type BackupJoinTableName = (typeof BACKUP_JOIN_TABLES)[number]

/** Encrypted-at-rest fields decrypted on export and re-encrypted on import. */
export const BACKUP_SECRET_FIELDS: Partial<Record<BackupModelName, readonly string[]>> = {
  HomeAssistantConfig: ['accessToken'],
  ImmichConfig: ['apiKey'],
  WifiConfig: ['password'],
}

/** Metadata describing an export, checked on import before anything is written. */
export const BackupManifestSchema = z.object({
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  app: z.literal('hame'),
  /** Latest applied Prisma migration at export time — the version gate (§8.15). */
  migration: z.string().min(1),
  createdAt: z.string(),
  /** Per-model row counts, re-checked against the data on import. */
  counts: z.record(z.number().int().nonnegative()),
})
export type BackupManifest = z.infer<typeof BackupManifestSchema>

/** The decrypted inner payload, before the whole file is passphrase-encrypted. */
export const BackupPayloadSchema = z.object({
  manifest: BackupManifestSchema,
  tables: z.record(z.array(z.record(z.unknown()))),
  joinTables: z.record(z.array(z.object({ A: z.string(), B: z.string() }))),
})
export type BackupPayload = z.infer<typeof BackupPayloadSchema>

/**
 * The file written to disk / uploaded on import. A clear header (KDF + cipher
 * params) plus the encrypted payload — opaque without the passphrase, which also
 * protects the password hashes and secrets inside. GCM's auth tag doubles as
 * passphrase verification.
 */
export const BackupEnvelopeSchema = z.object({
  hameBackup: z.literal(BACKUP_FORMAT_VERSION),
  kdf: z.object({
    algo: z.literal('argon2id'),
    salt: z.string(),
    memoryCost: z.number().int().positive(),
    timeCost: z.number().int().positive(),
    parallelism: z.number().int().positive(),
  }),
  cipher: z.literal('aes-256-gcm'),
  iv: z.string(),
  authTag: z.string(),
  ciphertext: z.string(),
})
export type BackupEnvelope = z.infer<typeof BackupEnvelopeSchema>

/** Export request — a passphrase to encrypt the file under. */
export const ExportBackupSchema = z.object({
  passphrase: z.string().min(8, 'Use a passphrase of at least 8 characters'),
})
export type ExportBackupInput = z.infer<typeof ExportBackupSchema>

/** Import request — the uploaded envelope plus its passphrase. */
export const ImportBackupSchema = z.object({
  passphrase: z.string().min(1, 'Enter the backup passphrase'),
  envelope: BackupEnvelopeSchema,
})
export type ImportBackupInput = z.infer<typeof ImportBackupSchema>

/** What a completed restore reports back. */
export const ImportBackupResultSchema = z.object({
  restored: z.record(z.number().int().nonnegative()),
  totalRows: z.number().int().nonnegative(),
})
export type ImportBackupResult = z.infer<typeof ImportBackupResultSchema>
