import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import type { BackupEnvelope } from '@hame/shared'
import { BACKUP_FORMAT_VERSION } from '@hame/shared'
import { HttpError } from './http-error.js'

/**
 * Passphrase-based whole-file encryption for backups (spec §8.15, §9.8). Unlike
 * {@link ./crypto.ts} (which keys off the instance's `ENCRYPTION_KEY`), a backup
 * is protected by a **user passphrase** so it restores onto a different box: an
 * argon2id KDF stretches the passphrase into a 32-byte key, then AES-256-GCM seals
 * the payload. The at-rest secrets inside are decrypted before sealing and
 * re-encrypted under the new instance's key on import, so the file is never chained
 * to one machine's key.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // 96-bit GCM nonce
const SALT_BYTES = 16
const KEY_BYTES = 32

// argon2id cost parameters (OWASP-leaning defaults). Stored in the envelope header
// so import re-derives the same key regardless of this build's values.
const KDF_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

function deriveKey(
  passphrase: string,
  salt: Buffer,
  params: { memoryCost: number; timeCost: number; parallelism: number },
): Promise<Buffer> {
  return argon2.hash(passphrase, {
    type: argon2.argon2id,
    raw: true,
    salt,
    hashLength: KEY_BYTES,
    memoryCost: params.memoryCost,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
  })
}

/** Seal a plaintext payload under a passphrase, returning the JSON envelope. */
export async function sealBackup(plaintext: string, passphrase: string): Promise<BackupEnvelope> {
  const salt = randomBytes(SALT_BYTES)
  const key = await deriveKey(passphrase, salt, KDF_PARAMS)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    hameBackup: BACKUP_FORMAT_VERSION,
    kdf: { algo: 'argon2id', salt: salt.toString('base64'), ...KDF_PARAMS },
    cipher: ALGORITHM,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

/**
 * Open a sealed envelope with its passphrase. A wrong passphrase (or a tampered
 * file) fails GCM's auth-tag check → a clean 400, never a garbage parse.
 */
export async function openBackup(envelope: BackupEnvelope, passphrase: string): Promise<string> {
  const salt = Buffer.from(envelope.kdf.salt, 'base64')
  const key = await deriveKey(passphrase, salt, envelope.kdf)
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
  try {
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  } catch {
    throw HttpError.badRequest('Incorrect passphrase or corrupt backup file')
  }
}
