import { describe, it, expect } from 'vitest'
import { parseDurationToSeconds } from '../lib/duration.js'

describe('parseDurationToSeconds', () => {
  it('parses each unit', () => {
    expect(parseDurationToSeconds('30s')).toBe(30)
    expect(parseDurationToSeconds('15m')).toBe(900)
    expect(parseDurationToSeconds('1h')).toBe(3600)
    expect(parseDurationToSeconds('7d')).toBe(604800)
    expect(parseDurationToSeconds('2w')).toBe(1209600)
  })

  it('throws on malformed input', () => {
    expect(() => parseDurationToSeconds('')).toThrow()
    expect(() => parseDurationToSeconds('15')).toThrow()
    expect(() => parseDurationToSeconds('abc')).toThrow()
    expect(() => parseDurationToSeconds('15y')).toThrow()
  })
})
