import { describe, it, expect } from 'vitest'
import type { HaEntityState } from '@hame/shared'
import {
  clampSetpoint,
  haClimateView,
  HaServiceCallSchema,
  isHaServiceAllowed,
  sanitiseHaServiceData,
} from '@hame/shared'
import { haClient } from '../integrations/home-assistant/client.js'

/** A climate entity as HA publishes one, overridable per test. */
function climate(attributes: Record<string, unknown> = {}, state = 'heat'): HaEntityState {
  return {
    entityId: 'climate.hallway',
    domain: 'climate',
    state,
    friendlyName: 'Hallway',
    attributes: {
      current_temperature: 19.5,
      temperature: 20,
      min_temp: 7,
      max_temp: 30,
      target_temp_step: 0.5,
      ...attributes,
    },
    lastChanged: null,
  }
}

describe('isHaServiceAllowed', () => {
  it('permits the smart-home control surface', () => {
    expect(isHaServiceAllowed('light', 'toggle')).toBe(true)
    expect(isHaServiceAllowed('switch', 'turn_on')).toBe(true)
    expect(isHaServiceAllowed('scene', 'turn_on')).toBe(true)
    expect(isHaServiceAllowed('automation', 'trigger')).toBe(true)
    expect(isHaServiceAllowed('climate', 'set_temperature')).toBe(true)
    expect(isHaServiceAllowed('climate', 'set_hvac_mode')).toBe(true)
  })

  it('rejects anything outside the allowlist', () => {
    expect(isHaServiceAllowed('scene', 'toggle')).toBe(false) // scenes only turn_on
    expect(isHaServiceAllowed('lock', 'unlock')).toBe(false) // lock not controllable here
    expect(isHaServiceAllowed('homeassistant', 'restart')).toBe(false)
    expect(isHaServiceAllowed('climate', 'set_preset_mode')).toBe(false) // out of scope
    expect(isHaServiceAllowed('climate', 'turn_off')).toBe(false) // mode, not a power verb
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

  it('accepts a setpoint with its temperature', () => {
    const parsed = HaServiceCallSchema.safeParse({
      domain: 'climate',
      service: 'set_temperature',
      entityId: 'climate.hallway',
      data: { temperature: 20.5 },
    })
    expect(parsed.success).toBe(true)
  })

  it('refuses a setpoint with no temperature at all', () => {
    const parsed = HaServiceCallSchema.safeParse({
      domain: 'climate',
      service: 'set_temperature',
      entityId: 'climate.hallway',
    })
    expect(parsed.success).toBe(false)
  })

  it('refuses a temperature outside the absolute envelope', () => {
    for (const temperature of [40, -5, 100]) {
      const parsed = HaServiceCallSchema.safeParse({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.hallway',
        data: { temperature },
      })
      expect(parsed.success).toBe(false)
    }
  })

  it('refuses a temperature that is not a number', () => {
    const parsed = HaServiceCallSchema.safeParse({
      domain: 'climate',
      service: 'set_temperature',
      entityId: 'climate.hallway',
      data: { temperature: '20' },
    })
    expect(parsed.success).toBe(false)
  })

  it('refuses an unknown key smuggled alongside a valid one', () => {
    const parsed = HaServiceCallSchema.safeParse({
      domain: 'climate',
      service: 'set_temperature',
      entityId: 'climate.hallway',
      data: { temperature: 20, entity_id: 'climate.everything' },
    })
    expect(parsed.success).toBe(false)
  })

  it('refuses an hvac mode Hame does not offer', () => {
    for (const hvac_mode of ['cool', 'auto', 'dry', 'heat_cool']) {
      const parsed = HaServiceCallSchema.safeParse({
        domain: 'climate',
        service: 'set_hvac_mode',
        entityId: 'climate.hallway',
        data: { hvac_mode },
      })
      expect(parsed.success).toBe(false)
    }
  })

  it('accepts the two hvac modes it does offer', () => {
    for (const hvac_mode of ['off', 'heat']) {
      const parsed = HaServiceCallSchema.safeParse({
        domain: 'climate',
        service: 'set_hvac_mode',
        entityId: 'climate.hallway',
        data: { hvac_mode },
      })
      expect(parsed.success).toBe(true)
    }
  })

  it('refuses arguments given to a service that takes none', () => {
    const parsed = HaServiceCallSchema.safeParse({
      domain: 'light',
      service: 'toggle',
      entityId: 'light.kitchen',
      data: { brightness: 255 },
    })
    expect(parsed.success).toBe(false)
  })

  it('still accepts an argument-less service sent an empty payload', () => {
    const parsed = HaServiceCallSchema.safeParse({
      domain: 'light',
      service: 'toggle',
      entityId: 'light.kitchen',
      data: {},
    })
    expect(parsed.success).toBe(true)
  })
})

describe('sanitiseHaServiceData', () => {
  it('returns nothing for a service that takes no arguments', () => {
    expect(sanitiseHaServiceData('light', 'toggle', { brightness: 255 })).toBeUndefined()
  })

  it('strips everything the service did not declare', () => {
    // The request schema types `data` as an open record, so this second parse is
    // what actually guarantees only declared keys reach Home Assistant.
    expect(() =>
      sanitiseHaServiceData('climate', 'set_temperature', {
        temperature: 20,
        hvac_mode: 'cool',
      }),
    ).toThrow()
  })

  it('passes a clean payload through', () => {
    expect(sanitiseHaServiceData('climate', 'set_temperature', { temperature: 20 })).toEqual({
      temperature: 20,
    })
  })
})

describe('haClimateView', () => {
  it('reads the fields a thermostat control needs', () => {
    expect(haClimateView(climate())).toEqual({
      current: 19.5,
      target: 20,
      min: 7,
      max: 30,
      step: 0.5,
      isOn: true,
    })
  })

  it('treats any mode other than off as on', () => {
    expect(haClimateView(climate({}, 'off')).isOn).toBe(false)
    expect(haClimateView(climate({}, 'heat')).isOn).toBe(true)
    expect(haClimateView(climate({}, 'auto')).isOn).toBe(true)
  })

  it('falls back to HA’s own defaults when a device publishes no range', () => {
    const view = haClimateView(climate({ min_temp: null, max_temp: null, target_temp_step: null }))
    expect(view).toMatchObject({ min: 7, max: 35, step: 0.5 })
  })

  it('reports a missing temperature as null rather than zero', () => {
    const view = haClimateView(climate({ current_temperature: null, temperature: null }))
    expect(view.current).toBeNull()
    expect(view.target).toBeNull()
  })

  it('holds a device’s claimed range inside the absolute envelope', () => {
    const view = haClimateView(climate({ min_temp: -50, max_temp: 200 }))
    expect(view.min).toBe(4)
    expect(view.max).toBe(35)
  })

  it('survives a device reporting its range backwards', () => {
    const view = haClimateView(climate({ min_temp: 28, max_temp: 10 }))
    expect(view.min).toBeLessThanOrEqual(view.max)
  })
})

describe('clampSetpoint', () => {
  const view = haClimateView(climate())

  it('holds a target inside the device’s own range', () => {
    expect(clampSetpoint(45, view)).toBe(30) // the device's max, not the envelope's
    expect(clampSetpoint(1, view)).toBe(7)
  })

  it('rounds to the device’s step', () => {
    expect(clampSetpoint(20.3, view)).toBe(20.5)
    expect(clampSetpoint(20.1, view)).toBe(20)
  })

  it('leaves no floating-point dust behind', () => {
    const tenths = haClimateView(climate({ target_temp_step: 0.1 }))
    expect(clampSetpoint(20.3, tenths)).toBe(20.3)
  })

  it('copes with a device claiming a zero step', () => {
    const noStep = haClimateView(climate({ target_temp_step: 0 }))
    expect(clampSetpoint(20.3, noStep)).toBe(20.3)
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
