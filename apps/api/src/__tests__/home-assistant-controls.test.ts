import { describe, it, expect } from 'vitest'
import type { HaEntityState } from '@hame/shared'
import {
  clampSetpoint,
  climateOffCall,
  climateOnCall,
  climateStatus,
  haClimateView,
  HaServiceCallSchema,
  isHaServiceAllowed,
  isSchedulePreset,
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
    expect(isHaServiceAllowed('climate', 'set_preset_mode')).toBe(true)
    expect(isHaServiceAllowed('climate', 'turn_on')).toBe(true)
    expect(isHaServiceAllowed('climate', 'turn_off')).toBe(true)
  })

  it('rejects anything outside the allowlist', () => {
    expect(isHaServiceAllowed('scene', 'toggle')).toBe(false) // scenes only turn_on
    expect(isHaServiceAllowed('lock', 'unlock')).toBe(false) // lock not controllable here
    expect(isHaServiceAllowed('homeassistant', 'restart')).toBe(false)
    // Real climate services HA exposes that Hame still has no business relaying —
    // the widget controls heating, not humidity, fans or swing (§10 Phase 23).
    expect(isHaServiceAllowed('climate', 'set_humidity')).toBe(false)
    expect(isHaServiceAllowed('climate', 'set_fan_mode')).toBe(false)
    expect(isHaServiceAllowed('climate', 'set_swing_mode')).toBe(false)
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
      action: null,
      hvacModes: [],
      presets: [],
      preset: null,
    })
  })

  it('reads the vocabularies the device declares for itself', () => {
    const view = haClimateView(
      climate({
        hvac_modes: ['off', 'heat_cool'],
        preset_modes: ['auto', 'manual'],
        preset_mode: 'auto',
      }),
    )
    expect(view).toMatchObject({
      hvacModes: ['off', 'heat_cool'],
      presets: ['auto', 'manual'],
      preset: 'auto',
    })
  })

  it('ignores non-string entries in a device’s declared lists', () => {
    const view = haClimateView(climate({ hvac_modes: ['off', 3, null, 'heat'] }))
    expect(view.hvacModes).toEqual(['off', 'heat'])
  })

  it('reads what the thermostat says it is doing, when it says so', () => {
    expect(haClimateView(climate({ hvac_action: 'heating' })).action).toBe('heating')
    expect(haClimateView(climate({ hvac_action: '' })).action).toBeNull()
    expect(haClimateView(climate({ hvac_action: 3 })).action).toBeNull()
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

describe('climateOnCall / climateOffCall', () => {
  const view = (attributes: Record<string, unknown>, state = 'heat') =>
    haClimateView(climate(attributes, state))

  it('names the mode when the device lists one Hame sets', () => {
    expect(climateOnCall(view({ hvac_modes: ['off', 'heat'] }))).toEqual({
      service: 'set_hvac_mode',
      data: { hvac_mode: 'heat' },
    })
  })

  it('lets a device that heats under another name choose for itself', () => {
    // The real thermostat: its only on-mode is `heat_cool`, so naming `heat`
    // would be rejected outright and the heating could not be switched back on.
    expect(climateOnCall(view({ hvac_modes: ['off', 'heat_cool'] }))).toEqual({
      service: 'turn_on',
    })
    expect(climateOnCall(view({ hvac_modes: ['off', 'auto'] }))).toEqual({ service: 'turn_on' })
  })

  it('falls back to turn_on when a device publishes no modes at all', () => {
    expect(climateOnCall(view({ hvac_modes: null }))).toEqual({ service: 'turn_on' })
  })

  it('offers nothing for a device that only knows how to be off', () => {
    expect(climateOnCall(view({ hvac_modes: ['off'] }))).toBeNull()
  })

  it('turns off by name where it can, and by service where it cannot', () => {
    expect(climateOffCall(view({ hvac_modes: ['off', 'heat_cool'] }))).toEqual({
      service: 'set_hvac_mode',
      data: { hvac_mode: 'off' },
    })
    expect(climateOffCall(view({ hvac_modes: ['heat_cool'] }))).toEqual({ service: 'turn_off' })
  })

  it('only ever asks for services the allowlist carries', () => {
    for (const modes of [['off', 'heat'], ['off', 'heat_cool'], ['off'], []]) {
      const call = climateOnCall(view({ hvac_modes: modes })) ?? climateOffCall(view({}))
      expect(isHaServiceAllowed('climate', call.service)).toBe(true)
    }
  })
})

describe('isSchedulePreset', () => {
  it('recognises the presets that mean "running its own schedule"', () => {
    expect(isSchedulePreset('auto')).toBe(true)
    expect(isSchedulePreset('Auto')).toBe(true)
    expect(isSchedulePreset('program')).toBe(true)
  })

  it('says nothing about a preset it does not recognise', () => {
    expect(isSchedulePreset('manual')).toBe(false)
    expect(isSchedulePreset('eco')).toBe(false)
    expect(isSchedulePreset('boost')).toBe(false)
    expect(isSchedulePreset(null)).toBe(false)
  })
})

describe('climateStatus', () => {
  it('is off whenever the thermostat is off, whatever else it reports', () => {
    const view = haClimateView(climate({ hvac_action: 'heating' }, 'off'))
    expect(climateStatus(view)).toBe('off')
  })

  it('believes the thermostat over the temperatures', () => {
    // Asking for less than the room already has, but the boiler is still firing.
    const firing = haClimateView(climate({ hvac_action: 'heating', temperature: 18 }))
    expect(climateStatus(firing)).toBe('heating')

    // Asking for more than the room has, but the thermostat has settled — the
    // deadband case the naive comparison gets wrong.
    const settled = haClimateView(climate({ hvac_action: 'idle', temperature: 22 }))
    expect(climateStatus(settled)).toBe('idle')
  })

  it('treats any other action the thermostat reports as not heating', () => {
    expect(climateStatus(haClimateView(climate({ hvac_action: 'cooling' })))).toBe('idle')
    expect(climateStatus(haClimateView(climate({ hvac_action: 'preheating' })))).toBe('idle')
  })

  it('falls back to the temperatures when nothing is published', () => {
    expect(climateStatus(haClimateView(climate({ temperature: 22 })))).toBe('heating')
    expect(climateStatus(haClimateView(climate({ temperature: 18 })))).toBe('idle')
  })

  it('does not claim to be heating when a temperature is missing', () => {
    expect(climateStatus(haClimateView(climate({ temperature: null })))).toBe('idle')
    expect(climateStatus(haClimateView(climate({ current_temperature: null })))).toBe('idle')
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
