import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { HaEntityState } from '@hame/shared'

/**
 * The impure half of the break-through (spec §8.13, §10 Phase 21): reading a
 * phone's state out of the Phase 6.2 entity registry, and the escalate → alert →
 * unwind sequence around one push.
 */

const getEntity = vi.fn()
vi.mock('../integrations/home-assistant/client.js', () => ({ haClient: { getEntity } }))
vi.mock('../integrations/home-assistant/notifications.js', () => ({
  sendHaNotification: vi.fn(),
}))

const { sendHaNotification } = await import('../integrations/home-assistant/notifications.js')
const { readDeviceAudioState, canBreakThrough, withBreakThrough, flushPendingRestores } =
  await import('../integrations/home-assistant/alert-escalation.js')

const HA = { url: 'http://ha', token: 't' }
const PHONE = 'mobile_app_bens_phone'

/** An entity as the registry holds it. */
const entity = (state: string, attributes: Record<string, unknown> = {}): HaEntityState => ({
  entityId: 'sensor.x',
  domain: 'sensor',
  state,
  friendlyName: null,
  attributes,
  lastChanged: null,
})

/** Wire the registry so a phone reports the given sensors and nothing else. */
const registry = (sensors: Record<string, HaEntityState>) => {
  getEntity.mockImplementation((id: string) => sensors[id] ?? null)
}

const ids = {
  dnd: 'sensor.bens_phone_do_not_disturb_sensor',
  ringer: 'sensor.bens_phone_ringer_mode',
  volNotification: 'sensor.bens_phone_volume_level_notification',
  volAlarm: 'sensor.bens_phone_volume_level_alarm',
}

/** The command names sent, in order. */
const sentCommands = () =>
  vi.mocked(sendHaNotification).mock.calls.map((c) => c[3].message as string)

/** The settle between the last lift command and the alert. */
const SETTLE_MS = 1_500

/**
 * Start a break-through and advance past its settle wait, so a test doesn't sit
 * on a timer. Returns the original promise, so rejection still surfaces.
 */
const breakThrough = async <T>(send: () => Promise<T>): Promise<T> => {
  const result = withBreakThrough(HA, PHONE, send)
  result.catch(() => {}) // the caller asserts on it; don't trip unhandled-rejection
  await vi.advanceTimersByTimeAsync(SETTLE_MS)
  return result
}

beforeEach(() => {
  vi.useFakeTimers()
  getEntity.mockReset()
  getEntity.mockReturnValue(null)
  vi.mocked(sendHaNotification).mockReset()
  vi.mocked(sendHaNotification).mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('readDeviceAudioState', () => {
  it('reads each sensor independently from the registry', () => {
    registry({
      [ids.ringer]: entity('vibrate'),
      [ids.volAlarm]: entity('3', { min: 0, max: 7 }),
    })
    expect(readDeviceAudioState(PHONE)).toEqual({
      dnd: null,
      ringerMode: 'vibrate',
      notificationVolume: null,
      alarmVolume: { level: 3, max: 7 },
    })
  })

  it('treats a volume with no usable max as unreadable', () => {
    // Without the device's own ceiling there is no honest "turn it up" target.
    registry({ [ids.volAlarm]: entity('3') })
    expect(readDeviceAudioState(PHONE).alarmVolume).toBeNull()
  })

  it('treats a non-numeric volume as unreadable', () => {
    registry({ [ids.volAlarm]: entity('unavailable', { max: 7 }) })
    expect(readDeviceAudioState(PHONE).alarmVolume).toBeNull()
  })

  it('reads nothing for a phone with no such sensors (an iPhone)', () => {
    expect(canBreakThrough(PHONE)).toBe(false)
    expect(readDeviceAudioState(PHONE)).toEqual({
      dnd: null,
      ringerMode: null,
      notificationVolume: null,
      alarmVolume: null,
    })
  })
})

describe('withBreakThrough', () => {
  it('sends only the alert when nothing can be read', async () => {
    const send = vi.fn().mockResolvedValue(true)
    await expect(withBreakThrough(HA, PHONE, send)).resolves.toBe(true)
    expect(send).toHaveBeenCalledOnce()
    // Critically: no device command was aimed at a phone that never answered.
    expect(sendHaNotification).not.toHaveBeenCalled()
  })

  it('lifts the phone before the alert, and puts it back after the delay', async () => {
    registry({ [ids.ringer]: entity('silent'), [ids.volAlarm]: entity('1', { max: 7 }) })

    const order: string[] = []
    vi.mocked(sendHaNotification).mockImplementation(async (_u, _t, _s, payload) => {
      order.push(payload.message)
      return true
    })
    const send = vi.fn().mockImplementation(async () => {
      order.push('ALERT')
      return true
    })

    await breakThrough(send)

    // Everything is lifted first; the alert lands on a phone that can hear it.
    expect(order).toEqual([
      'command_ringer_mode',
      'command_volume_level',
      'command_screen_on',
      'ALERT',
    ])

    await vi.advanceTimersByTimeAsync(20_000)
    expect(order.slice(4)).toEqual(['command_volume_level', 'command_ringer_mode'])
  })

  it('holds the alert back until the lift commands have had time to land', async () => {
    // The rung most worth protecting: an alert that overtakes its own
    // command_dnd is suppressed by the very filter it was meant to lift.
    registry({ [ids.dnd]: entity('priority_only') })
    const send = vi.fn().mockResolvedValue(true)

    const result = withBreakThrough(HA, PHONE, send)
    await vi.advanceTimersByTimeAsync(SETTLE_MS - 1)
    expect(sentCommands()).toEqual(['command_dnd', 'command_screen_on'])
    expect(send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await result
    expect(send).toHaveBeenCalledOnce()
  })

  it('does not delay an alert that never escalated', async () => {
    // Nothing was lifted, so there is nothing to outrun — an iPhone or an
    // un-set-up handset shouldn't pay the settle on an urgent message.
    const send = vi.fn().mockResolvedValue(true)
    await withBreakThrough(HA, PHONE, send)
    expect(send).toHaveBeenCalledOnce()
  })

  it('leaves the phone lifted until the delay elapses', async () => {
    registry({ [ids.ringer]: entity('vibrate') })
    await breakThrough(async () => true)

    await vi.advanceTimersByTimeAsync(19_000)
    expect(sentCommands()).toEqual(['command_ringer_mode', 'command_screen_on'])
  })

  it('still unwinds when the alert itself fails', async () => {
    registry({ [ids.ringer]: entity('vibrate') })

    await expect(breakThrough(() => Promise.reject(new Error('HA rejected it')))).rejects.toThrow(
      'HA rejected it',
    )

    // A failed push must never strand a phone off silent.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(sentCommands().at(-1)).toBe('command_ringer_mode')
  })

  it('sends the alert even when a lift command is rejected', async () => {
    registry({ [ids.ringer]: entity('vibrate') })
    vi.mocked(sendHaNotification).mockResolvedValue(false)
    const send = vi.fn().mockResolvedValue(true)
    await breakThrough(send)
    expect(send).toHaveBeenCalledOnce()
  })

  it('passes the alert’s own result straight back', async () => {
    registry({ [ids.ringer]: entity('vibrate') })
    await expect(breakThrough(async () => false)).resolves.toBe(false)
  })

  it('runs a pending unwind on shutdown rather than abandoning it', async () => {
    registry({ [ids.dnd]: entity('priority_only') })
    await breakThrough(async () => true)
    expect(sentCommands()).toEqual(['command_dnd', 'command_screen_on'])

    await flushPendingRestores()
    expect(sentCommands().at(-1)).toBe('command_dnd')
    expect(vi.mocked(sendHaNotification).mock.calls.at(-1)?.[3].data).toEqual({
      command: 'priority_only',
    })

    // …and the timer doesn't then fire a second time.
    const afterFlush = vi.mocked(sendHaNotification).mock.calls.length
    await vi.advanceTimersByTimeAsync(20_000)
    expect(vi.mocked(sendHaNotification).mock.calls.length).toBe(afterFlush)
  })

  it('sends device commands with no title, so a malformed one is obvious', async () => {
    registry({ [ids.ringer]: entity('vibrate') })
    await breakThrough(async () => true)
    expect(vi.mocked(sendHaNotification).mock.calls[0][3].title).toBeUndefined()
  })
})
