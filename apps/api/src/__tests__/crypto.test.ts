import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret } from '../lib/crypto.js'

describe('crypto (AES-256-GCM secret encryption)', () => {
  it('round-trips a secret through encrypt → decrypt', () => {
    const plain = 'eyJ.long-lived-home-assistant-token.xyz'
    const encrypted = encryptSecret(plain)
    expect(encrypted).not.toContain(plain)
    expect(encrypted.split(':')).toHaveLength(3) // iv:authTag:ciphertext
    expect(decryptSecret(encrypted)).toBe(plain)
  })

  it('produces a different ciphertext each call (random IV)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  it('rejects a tampered payload (GCM auth tag)', () => {
    const encrypted = encryptSecret('secret')
    const [iv, , ciphertext] = encrypted.split(':')
    const forgedTag = Buffer.alloc(16, 1).toString('base64')
    expect(() => decryptSecret(`${iv}:${forgedTag}:${ciphertext}`)).toThrow()
  })

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret('not-a-valid-blob')).toThrow('Malformed encrypted payload')
  })
})
