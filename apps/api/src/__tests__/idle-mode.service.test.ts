import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { idleModeSettings: { upsert } },
}))

const { getIdleModeSettings, updateIdleModeSettings } =
  await import('../services/idle-mode.service.js')

beforeEach(() => upsert.mockReset())

describe('idle-mode settings service', () => {
  it('upserts the singleton row on read (defaults applied by the schema)', async () => {
    upsert.mockResolvedValue({ id: 'singleton', enabled: true })
    await getIdleModeSettings()
    expect(upsert.mock.calls[0][0].where).toEqual({ id: 'singleton' })
    expect(upsert.mock.calls[0][0].update).toEqual({})
  })

  it('writes a partial update through to the singleton', async () => {
    upsert.mockResolvedValue({ id: 'singleton', activationMinutes: 10 })
    await updateIdleModeSettings({ activationMinutes: 10, immichEnabled: false })
    expect(upsert.mock.calls[0][0].update).toEqual({ activationMinutes: 10, immichEnabled: false })
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      id: 'singleton',
      activationMinutes: 10,
      immichEnabled: false,
    })
  })
})
