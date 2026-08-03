import { describe, it, expect, vi, beforeEach } from 'vitest'

const user = { findMany: vi.fn(), findUnique: vi.fn() }

vi.mock('../lib/prisma.js', () => ({ prisma: { user } }))
vi.mock('../services/household-settings.service.js', () => ({
  getHouseholdSettings: vi.fn(),
}))
vi.mock('../services/home-assistant-config.service.js', () => ({
  getConnectionSettings: vi.fn(),
}))
vi.mock('../integrations/home-assistant/notifications.js', () => ({
  sendHaNotification: vi.fn(),
  // Keep the real payload so the "always critical" assertion is meaningful.
  criticalAlertData: () => ({ push: { sound: { critical: 1 } }, ttl: 0, priority: 'high' }),
}))
// The break-through itself is covered in alert-break-through.test.ts; here we only
// care that the opt-in decides whether the alert goes through it (§10 Phase 21).
vi.mock('../integrations/home-assistant/alert-escalation.js', () => ({
  canBreakThrough: vi.fn(),
  withBreakThrough: vi.fn(),
}))

const { getHouseholdSettings } = await import('../services/household-settings.service.js')
const { getConnectionSettings } = await import('../services/home-assistant-config.service.js')
const { sendHaNotification } = await import('../integrations/home-assistant/notifications.js')
const { canBreakThrough, withBreakThrough } =
  await import('../integrations/home-assistant/alert-escalation.js')
const { listAlertRecipients, sendAlert } = await import('../services/alert.service.js')

/** A member row shaped as Prisma returns it with the recipient include. */
const memberRow = (
  id: string,
  firstName: string,
  haNotifyService: string | null,
  alertBreakThrough = false,
) => ({
  id,
  firstName,
  colour: '#3B82F6',
  notificationPrefs: haNotifyService ? { haNotifyService, alertBreakThrough } : null,
})

const HA = { url: 'http://ha', token: 't' }

beforeEach(() => {
  for (const fn of [user.findMany, user.findUnique]) fn.mockReset()
  vi.mocked(getHouseholdSettings).mockReset()
  vi.mocked(getConnectionSettings).mockReset()
  vi.mocked(sendHaNotification).mockReset()
  vi.mocked(canBreakThrough).mockReset()
  vi.mocked(withBreakThrough).mockReset()
  // By default a phone answers nothing, so alerts take the plain critical push.
  vi.mocked(canBreakThrough).mockReturnValue(false)
  vi.mocked(withBreakThrough).mockImplementation((_s, _svc, send) => send())
  // Defaults: feature on, HA connected, push accepted.
  vi.mocked(getHouseholdSettings).mockResolvedValue({ householdAlertsEnabled: true } as never)
  vi.mocked(getConnectionSettings).mockResolvedValue(HA)
  vi.mocked(sendHaNotification).mockResolvedValue(true)
})

describe('listAlertRecipients', () => {
  it('lists other members with canReceive from their phone target', async () => {
    user.findMany.mockResolvedValue([
      memberRow('sam', 'Sam', 'mobile_app_sam'),
      memberRow('ada', 'Ada', null),
    ])
    const res = await listAlertRecipients({ id: 'me', role: 'MEMBER' })
    expect(res).toEqual({
      enabled: true,
      haConfigured: true,
      recipients: [
        {
          id: 'sam',
          firstName: 'Sam',
          colour: '#3B82F6',
          canReceive: true,
          willBreakThrough: false,
        },
        {
          id: 'ada',
          firstName: 'Ada',
          colour: '#3B82F6',
          canReceive: false,
          willBreakThrough: false,
        },
      ],
    })
    // Excludes the caller and the tablet (PERSON_ROLES only).
    const where = user.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ id: { not: 'me' }, role: { in: ['ADMIN', 'MEMBER'] } })
  })

  it('returns no recipients when the household toggle is off', async () => {
    vi.mocked(getHouseholdSettings).mockResolvedValue({ householdAlertsEnabled: false } as never)
    const res = await listAlertRecipients({ id: 'me', role: 'MEMBER' })
    expect(res).toEqual({ enabled: false, haConfigured: true, recipients: [] })
    expect(user.findMany).not.toHaveBeenCalled()
  })

  it('returns no recipients for the tablet account so the icon never shows there', async () => {
    const res = await listAlertRecipients({ id: 'tablet', role: 'TABLET' })
    expect(res.recipients).toEqual([])
    expect(user.findMany).not.toHaveBeenCalled()
  })

  it('reports willBreakThrough only when opted in and the phone answers now', async () => {
    user.findMany.mockResolvedValue([
      memberRow('sam', 'Sam', 'mobile_app_sam', true),
      memberRow('ada', 'Ada', 'mobile_app_ada', false),
    ])
    vi.mocked(canBreakThrough).mockReturnValue(true)
    const res = await listAlertRecipients({ id: 'me', role: 'MEMBER' })
    expect(res.recipients.map((r) => r.willBreakThrough)).toEqual([true, false])
    // Ada opted out, so her phone's state is never even consulted.
    expect(canBreakThrough).toHaveBeenCalledOnce()
    expect(canBreakThrough).toHaveBeenCalledWith('mobile_app_sam')
  })

  it('reports willBreakThrough false when opted in but the phone is unreadable', async () => {
    user.findMany.mockResolvedValue([memberRow('sam', 'Sam', 'mobile_app_sam', true)])
    vi.mocked(canBreakThrough).mockReturnValue(false)
    const res = await listAlertRecipients({ id: 'me', role: 'MEMBER' })
    expect(res.recipients[0]).toMatchObject({ canReceive: true, willBreakThrough: false })
  })

  it('reports HA as unconfigured when no connection is set', async () => {
    vi.mocked(getConnectionSettings).mockResolvedValue(null)
    user.findMany.mockResolvedValue([])
    const res = await listAlertRecipients({ id: 'me', role: 'MEMBER' })
    expect(res.haConfigured).toBe(false)
  })
})

describe('sendAlert', () => {
  const sender = { id: 'me', role: 'MEMBER' }

  it('sends a critical push titled "Alert from <sender>" and reports delivered', async () => {
    user.findUnique
      .mockResolvedValueOnce({
        role: 'MEMBER',
        notificationPrefs: { haNotifyService: 'mobile_app_sam' },
      })
      .mockResolvedValueOnce({ firstName: 'Ben' })
    const res = await sendAlert(sender, 'sam', 'come here')
    expect(res).toEqual({ delivered: true })
    expect(sendHaNotification).toHaveBeenCalledTimes(1)
    expect(sendHaNotification).toHaveBeenCalledWith(HA.url, HA.token, 'mobile_app_sam', {
      title: 'Alert from Ben',
      message: 'come here',
      data: { push: { sound: { critical: 1 } }, ttl: 0, priority: 'high' },
    })
  })

  it('routes the push through the break-through when the recipient opted in', async () => {
    user.findUnique
      .mockResolvedValueOnce({
        role: 'MEMBER',
        notificationPrefs: { haNotifyService: 'mobile_app_sam', alertBreakThrough: true },
      })
      .mockResolvedValueOnce({ firstName: 'Ben' })
    await expect(sendAlert(sender, 'sam', 'come here')).resolves.toEqual({ delivered: true })
    expect(withBreakThrough).toHaveBeenCalledOnce()
    expect(vi.mocked(withBreakThrough).mock.calls[0][1]).toBe('mobile_app_sam')
    // The alert itself still goes out exactly as before, through the wrapper.
    expect(sendHaNotification).toHaveBeenCalledOnce()
  })

  it('sends the plain critical push when the recipient has not opted in', async () => {
    user.findUnique
      .mockResolvedValueOnce({
        role: 'MEMBER',
        notificationPrefs: { haNotifyService: 'mobile_app_sam', alertBreakThrough: false },
      })
      .mockResolvedValueOnce({ firstName: 'Ben' })
    await sendAlert(sender, 'sam', 'come here')
    // The sender can't elect to change someone else's phone settings.
    expect(withBreakThrough).not.toHaveBeenCalled()
    expect(sendHaNotification).toHaveBeenCalledOnce()
  })

  it('returns delivered:false without pushing when the recipient has no phone', async () => {
    user.findUnique
      .mockResolvedValueOnce({ role: 'MEMBER', notificationPrefs: null })
      .mockResolvedValueOnce({ firstName: 'Ben' })
    const res = await sendAlert(sender, 'sam', 'hi')
    expect(res).toEqual({ delivered: false })
    expect(sendHaNotification).not.toHaveBeenCalled()
  })

  it('refuses when the household toggle is off', async () => {
    vi.mocked(getHouseholdSettings).mockResolvedValue({ householdAlertsEnabled: false } as never)
    await expect(sendAlert(sender, 'sam', 'hi')).rejects.toMatchObject({ status: 403 })
    expect(sendHaNotification).not.toHaveBeenCalled()
  })

  it('refuses a tablet sender', async () => {
    await expect(sendAlert({ id: 'tablet', role: 'TABLET' }, 'sam', 'hi')).rejects.toMatchObject({
      status: 403,
    })
  })

  it('rejects alerting yourself', async () => {
    await expect(sendAlert(sender, 'me', 'hi')).rejects.toMatchObject({ status: 400 })
  })

  it('404s when the recipient is not a household member', async () => {
    user.findUnique
      .mockResolvedValueOnce(null) // recipient
      .mockResolvedValueOnce({ firstName: 'Ben' })
    await expect(sendAlert(sender, 'ghost', 'hi')).rejects.toMatchObject({ status: 404 })
  })

  it('502s when Home Assistant is not connected', async () => {
    vi.mocked(getConnectionSettings).mockResolvedValue(null)
    user.findUnique
      .mockResolvedValueOnce({
        role: 'MEMBER',
        notificationPrefs: { haNotifyService: 'mobile_app_sam' },
      })
      .mockResolvedValueOnce({ firstName: 'Ben' })
    await expect(sendAlert(sender, 'sam', 'hi')).rejects.toMatchObject({ status: 502 })
  })
})
