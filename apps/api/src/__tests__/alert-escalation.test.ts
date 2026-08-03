import { describe, it, expect } from 'vitest'
import {
  deviceSensorIds,
  isEscalationPossible,
  planEscalation,
  type DeviceAudioState,
} from '@hame/shared'

/**
 * The pure break-through planner (spec §8.13, §10 Phase 21). The property that
 * matters most here isn't which commands get sent — it's that Hame never changes
 * a setting it couldn't read, and therefore never changes one it can't put back.
 */

/** A phone with nothing readable — an iPhone, or an Android with sensors off. */
const nothingReadable: DeviceAudioState = {
  dnd: null,
  ringerMode: null,
  notificationVolume: null,
  alarmVolume: null,
}

/** A phone that is silenced every way it can be, with everything readable. */
const fullySilenced: DeviceAudioState = {
  dnd: 'priority_only',
  ringerMode: 'vibrate',
  notificationVolume: { level: 0, max: 7 },
  alarmVolume: { level: 2, max: 7 },
}

describe('planEscalation', () => {
  it('plans nothing when no setting can be read', () => {
    expect(planEscalation(nothingReadable)).toEqual({ escalate: [], restore: [] })
  })

  it('lifts every blocker on a fully silenced phone, outermost first', () => {
    const { escalate } = planEscalation(fullySilenced)
    expect(escalate.map((s) => s.message)).toEqual([
      'command_dnd',
      'command_ringer_mode',
      'command_volume_level',
      'command_volume_level',
      'command_screen_on',
    ])
    expect(escalate[0].data).toEqual({ command: 'off' })
    expect(escalate[1].data).toEqual({ command: 'normal' })
  })

  it('restores every changed setting to exactly what it read, in reverse', () => {
    const { restore } = planEscalation(fullySilenced)
    expect(restore).toEqual([
      { message: 'command_volume_level', data: { media_stream: 'alarm_stream', command: 2 } },
      {
        message: 'command_volume_level',
        data: { media_stream: 'notification_stream', command: 0 },
      },
      { message: 'command_ringer_mode', data: { command: 'vibrate' } },
      { message: 'command_dnd', data: { command: 'priority_only' } },
    ])
  })

  it('raises both streams to the device’s own maximum, not a fixed number', () => {
    const { escalate } = planEscalation({
      ...nothingReadable,
      notificationVolume: { level: 1, max: 15 },
      alarmVolume: { level: 3, max: 7 },
    })
    expect(escalate.slice(0, 2).map((s) => s.data)).toEqual([
      { media_stream: 'notification_stream', command: 15 },
      { media_stream: 'alarm_stream', command: 7 },
    ])
  })

  it('skips a rung whose setting is already permissive', () => {
    const { escalate, restore } = planEscalation({
      dnd: 'off',
      ringerMode: 'normal',
      notificationVolume: { level: 7, max: 7 },
      alarmVolume: null,
    })
    // Everything readable was already fine, so nothing is touched — and with
    // nothing lifted, the screen isn't woken either.
    expect(escalate).toEqual([])
    expect(restore).toEqual([])
  })

  it('plans only the rungs it can read, leaving the rest alone', () => {
    const { escalate, restore } = planEscalation({
      ...nothingReadable,
      ringerMode: 'silent',
    })
    expect(escalate.map((s) => s.message)).toEqual(['command_ringer_mode', 'command_screen_on'])
    // The unwind covers the one rung that was lifted, and nothing else.
    expect(restore).toEqual([{ message: 'command_ringer_mode', data: { command: 'silent' } }])
  })

  it('treats an unresolved sensor as unreadable rather than as a state', () => {
    for (const state of ['unknown', 'unavailable', '']) {
      expect(planEscalation({ ...nothingReadable, dnd: state, ringerMode: state })).toEqual({
        escalate: [],
        restore: [],
      })
    }
  })

  it('wakes the screen only after something was actually lifted', () => {
    const lifted = planEscalation({ ...nothingReadable, dnd: 'total_silence' })
    expect(lifted.escalate.at(-1)?.message).toBe('command_screen_on')
    // …and never on its own, which is what keeps a device command off an iPhone.
    expect(planEscalation(nothingReadable).escalate).toEqual([])
  })

  it('never plans an escalation step it cannot undo', () => {
    const { escalate, restore } = planEscalation(fullySilenced)
    const reversible = escalate.filter((s) => s.message !== 'command_screen_on')
    expect(restore).toHaveLength(reversible.length)
  })

  it('ignores a volume already at the ceiling', () => {
    const { escalate } = planEscalation({
      ...nothingReadable,
      notificationVolume: { level: 7, max: 7 },
      alarmVolume: { level: 6, max: 7 },
    })
    expect(escalate.map((s) => s.data)).toEqual([{ media_stream: 'alarm_stream', command: 7 }, {}])
  })
})

describe('isEscalationPossible', () => {
  it('is false when nothing can be read (iOS, or sensors off)', () => {
    expect(isEscalationPossible(nothingReadable)).toBe(false)
  })

  it('is true as soon as any one sensor answers', () => {
    expect(isEscalationPossible({ ...nothingReadable, ringerMode: 'normal' })).toBe(true)
    expect(isEscalationPossible({ ...nothingReadable, alarmVolume: { level: 7, max: 7 } })).toBe(
      true,
    )
  })

  it('is false when the sensors exist but haven’t resolved', () => {
    expect(isEscalationPossible({ ...nothingReadable, dnd: 'unavailable' })).toBe(false)
  })
})

describe('deviceSensorIds', () => {
  it('derives the sensor ids from the notify target’s own device slug', () => {
    expect(deviceSensorIds('mobile_app_bens_phone')).toEqual({
      dnd: 'sensor.bens_phone_do_not_disturb_sensor',
      ringerMode: 'sensor.bens_phone_ringer_mode',
      notificationVolume: 'sensor.bens_phone_volume_level_notification',
      alarmVolume: 'sensor.bens_phone_volume_level_alarm',
    })
  })

  it('tolerates a target that carries no mobile_app prefix', () => {
    expect(deviceSensorIds('bens_phone').ringerMode).toBe('sensor.bens_phone_ringer_mode')
  })
})
