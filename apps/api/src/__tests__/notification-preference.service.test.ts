import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { notificationPreference: { upsert } },
}))

const { getNotificationPreference, updateNotificationPreference } =
  await import('../services/notification-preference.service.js')

beforeEach(() => upsert.mockReset())

describe('notification-preference service', () => {
  it('upserts the user row on read, creating the all-on default', async () => {
    upsert.mockResolvedValue({ userId: 'u1', binReminders: true })
    await getNotificationPreference('u1')
    expect(upsert.mock.calls[0][0].where).toEqual({ userId: 'u1' })
    expect(upsert.mock.calls[0][0].update).toEqual({})
    expect(upsert.mock.calls[0][0].create).toEqual({ userId: 'u1' })
  })

  it('writes a partial toggle update through', async () => {
    upsert.mockResolvedValue({ userId: 'u1' })
    await updateNotificationPreference('u1', { binReminders: false, pushViaHA: true })
    expect(upsert.mock.calls[0][0].update).toEqual({ binReminders: false, pushViaHA: true })
  })

  it('stores a chosen notify target', async () => {
    upsert.mockResolvedValue({ userId: 'u1' })
    await updateNotificationPreference('u1', { haNotifyService: 'mobile_app_phone' })
    expect(upsert.mock.calls[0][0].update).toEqual({ haNotifyService: 'mobile_app_phone' })
  })

  it('clears the notify target when given an empty string', async () => {
    upsert.mockResolvedValue({ userId: 'u1' })
    await updateNotificationPreference('u1', { haNotifyService: '' })
    expect(upsert.mock.calls[0][0].update).toEqual({ haNotifyService: null })
  })

  it('leaves the target untouched when not in the patch', async () => {
    upsert.mockResolvedValue({ userId: 'u1' })
    await updateNotificationPreference('u1', { criticalAlerts: true })
    expect(upsert.mock.calls[0][0].update).toEqual({ criticalAlerts: true })
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('haNotifyService')
  })
})
