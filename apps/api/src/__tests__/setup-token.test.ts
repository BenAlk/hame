import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateSetupToken,
  getSetupToken,
  verifySetupToken,
  clearSetupToken,
} from '../lib/setup-token.js'

beforeEach(() => {
  clearSetupToken()
})

describe('setup token', () => {
  it('mints a fresh URL-safe token and exposes it', () => {
    const token = generateSetupToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(20)
    expect(getSetupToken()).toBe(token)
  })

  it('rotates the token on each generate', () => {
    const first = generateSetupToken()
    const second = generateSetupToken()
    expect(second).not.toBe(first)
    expect(verifySetupToken(first)).toBe(false)
    expect(verifySetupToken(second)).toBe(true)
  })

  it('verifies the exact token and rejects everything else', () => {
    const token = generateSetupToken()
    expect(verifySetupToken(token)).toBe(true)
    expect(verifySetupToken(token + 'x')).toBe(false) // length mismatch, no throw
    expect(verifySetupToken('')).toBe(false)
  })

  it('rejects any candidate when no token is outstanding', () => {
    expect(getSetupToken()).toBeNull()
    expect(verifySetupToken('anything')).toBe(false)
  })

  it('clears the token', () => {
    const token = generateSetupToken()
    clearSetupToken()
    expect(getSetupToken()).toBeNull()
    expect(verifySetupToken(token)).toBe(false)
  })
})
