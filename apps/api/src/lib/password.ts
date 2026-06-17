import argon2 from 'argon2'

/** Hash a plaintext password with argon2 (current best practice — see spec §11). */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain)
}

/** Verify a plaintext password against a stored argon2 hash. */
export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain)
}
