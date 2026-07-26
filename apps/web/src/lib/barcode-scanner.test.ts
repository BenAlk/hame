import { describe, it, expect } from 'vitest'
import { RESCAN_COOLDOWN_MS, shouldAcceptScan } from './barcode-scanner'

describe('shouldAcceptScan', () => {
  it('accepts the first scan', () => {
    expect(shouldAcceptScan('5000112637922', null, 1000)).toBe(true)
  })

  it('accepts a different code immediately', () => {
    const last = { code: '5000112637922', at: 1000 }
    expect(shouldAcceptScan('5000112637939', last, 1050)).toBe(true)
  })

  /** A barcode held in frame reports many times a second; only one is a scan. */
  it('ignores the same code inside the cooldown', () => {
    const last = { code: '5000112637922', at: 1000 }
    expect(shouldAcceptScan('5000112637922', last, 1000 + RESCAN_COOLDOWN_MS - 1)).toBe(false)
  })

  /** But scanning the same product again on purpose is two jars, not a glitch. */
  it('accepts the same code again after the cooldown', () => {
    const last = { code: '5000112637922', at: 1000 }
    expect(shouldAcceptScan('5000112637922', last, 1000 + RESCAN_COOLDOWN_MS)).toBe(true)
  })
})
