import { describe, it, expect } from 'vitest'
import { HaServiceCallSchema, isHaServiceAllowed } from '@hame/shared'
import { haClient } from '../integrations/home-assistant/client.js'

describe('isHaServiceAllowed', () => {
  it('permits the smart-home control surface', () => {
    expect(isHaServiceAllowed('light', 'toggle')).toBe(true)
    expect(isHaServiceAllowed('switch', 'turn_on')).toBe(true)
    expect(isHaServiceAllowed('scene', 'turn_on')).toBe(true)
    expect(isHaServiceAllowed('automation', 'trigger')).toBe(true)
  })

  it('rejects anything outside the allowlist', () => {
    expect(isHaServiceAllowed('scene', 'toggle')).toBe(false) // scenes only turn_on
    expect(isHaServiceAllowed('lock', 'unlock')).toBe(false) // lock not controllable here
    expect(isHaServiceAllowed('homeassistant', 'restart')).toBe(false)
  })
})

describe('HaServiceCallSchema', () => {
  it('accepts an allowlisted call', () => {
    const parsed = HaServiceCallSchema.safeParse({
      domain: 'light',
      service: 'toggle',
      entityId: 'light.kitchen',
    })
    expect(parsed.success).toBe(true)
  })

  it('refuses a service that is not on the allowlist', () => {
    const parsed = HaServiceCallSchema.safeParse({
      domain: 'lock',
      service: 'unlock',
      entityId: 'lock.front',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('haClient.callService when disconnected', () => {
  it('rejects rather than hanging when there is no live socket', async () => {
    // The singleton starts disconnected in a fresh test process.
    await expect(haClient.callService('light', 'toggle', 'light.kitchen')).rejects.toThrow(
      /not connected/i,
    )
  })
})
