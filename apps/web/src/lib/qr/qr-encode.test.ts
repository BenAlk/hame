import { describe, expect, it } from 'vitest'
import { encodeQr, reedSolomonMultiply } from './qr-encode'

describe('reedSolomonMultiply (GF(256), QR primitive 0x11D)', () => {
  it('has identity and zero elements', () => {
    expect(reedSolomonMultiply(0, 123)).toBe(0)
    expect(reedSolomonMultiply(123, 0)).toBe(0)
    expect(reedSolomonMultiply(123, 1)).toBe(123)
    expect(reedSolomonMultiply(1, 200)).toBe(200)
  })

  it('reduces by the QR field polynomial', () => {
    // 0x80 · 0x02 = 0x100, which reduces to 0x100 ^ 0x11D = 0x1D in this field.
    expect(reedSolomonMultiply(0x80, 0x02)).toBe(0x1d)
  })

  it('is commutative', () => {
    expect(reedSolomonMultiply(0x57, 0x13)).toBe(reedSolomonMultiply(0x13, 0x57))
  })
})

describe('encodeQr', () => {
  function checkSquare(text: string): boolean[][] {
    const m = encodeQr(text)
    expect(m.length).toBeGreaterThan(0)
    for (const row of m) expect(row.length).toBe(m.length)
    return m
  }

  it('produces a version-1 (21×21) matrix for a short payload', () => {
    const m = checkSquare('AB')
    expect(m.length).toBe(21)
  })

  it('draws the three finder patterns', () => {
    const m = encodeQr('AB')
    const size = m.length
    // A finder's outer ring is all dark; its second ring is the light frame.
    for (const [r, c] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      // Top row of the 7×7 finder is solid dark.
      for (let k = 0; k < 7; k++) expect(m[r][c + k]).toBe(true)
      // The inner light ring at offset 1.
      expect(m[r + 1][c + 1]).toBe(false)
      // The 3×3 dark centre.
      expect(m[r + 3][c + 3]).toBe(true)
    }
  })

  it('draws the timing patterns and the always-dark module', () => {
    const m = encodeQr('AB')
    const size = m.length
    // Timing runs alternate, dark at even indices.
    for (let i = 8; i < size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0)
      expect(m[i][6]).toBe(i % 2 === 0)
    }
    // The always-dark module sits at (4·version+9, 8) = (size-8, 8).
    expect(m[size - 8][8]).toBe(true)
  })

  it('grows the version to fit a larger payload', () => {
    const small = encodeQr('AB').length
    const large = encodeQr('x'.repeat(120)).length
    expect(large).toBeGreaterThan(small)
  })

  it('encodes a realistic WiFi payload without throwing', () => {
    const m = checkSquare('WIFI:T:WPA;S:Hame Household;P:correct horse battery;;')
    expect(m.length).toBeGreaterThanOrEqual(21)
  })
})
