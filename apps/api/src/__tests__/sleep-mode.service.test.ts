import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { sleepModeSettings: { upsert } },
}))

const { getSleepModeSettings, updateSleepModeSettings } =
  await import('../services/sleep-mode.service.js')

beforeEach(() => upsert.mockReset())

describe('sleep-mode settings service', () => {
  it('upserts the singleton row on read (defaults applied by the schema)', async () => {
    upsert.mockResolvedValue({ id: 'singleton', enabled: false })
    await getSleepModeSettings()
    expect(upsert.mock.calls[0][0].where).toEqual({ id: 'singleton' })
    expect(upsert.mock.calls[0][0].update).toEqual({})
  })

  it('writes a partial update through to the singleton', async () => {
    upsert.mockResolvedValue({ id: 'singleton', startMinutes: 1350 })
    await updateSleepModeSettings({ enabled: true, startMinutes: 1350 })
    expect(upsert.mock.calls[0][0].update).toEqual({ enabled: true, startMinutes: 1350 })
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      id: 'singleton',
      enabled: true,
      startMinutes: 1350,
    })
  })
})
