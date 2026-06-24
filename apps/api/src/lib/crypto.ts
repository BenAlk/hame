import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from './env.js'

/**
 * Symmetric encryption for integration secrets at rest (spec §11) — the Home
 * Assistant token today, the Immich API key later. AES-256-GCM with the 32-byte
 * key from `ENCRYPTION_KEY` (validated as 64 hex chars in env.ts).
 *
 * A value serialises to `iv:authTag:ciphertext`, each segment base64. GCM's auth
 * tag makes tampering detectable: {@link decryptSecret} throws if the blob was
 * altered or was encrypted under a different key.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // 96-bit nonce, the GCM standard
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex')

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join(':')
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('Malformed encrypted payload')
  const [iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'))
  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
