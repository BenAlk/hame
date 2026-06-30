import { describe, it, expect } from 'vitest'
import {
  criticalAlertData,
  mapNotifyTargets,
} from '../integrations/home-assistant/notifications.js'

/** A trimmed shape of HA's `GET /api/services` payload. */
const servicesPayload = [
  { domain: 'light', services: { turn_on: {}, turn_off: {} } },
  {
    domain: 'notify',
    services: {
      mobile_app_bens_phone: { name: 'Bens phone' },
      mobile_app_partner: {},
      persistent_notification: {},
    },
  },
]

describe('mapNotifyTargets', () => {
  it('extracts the notify domain services as pickable targets', () => {
    const targets = mapNotifyTargets(servicesPayload)
    const services = targets.map((t) => t.service)
    expect(services).toContain('mobile_app_bens_phone')
    expect(services).toContain('mobile_app_partner')
  })

  it('excludes the persistent_notification group (not a phone)', () => {
    const targets = mapNotifyTargets(servicesPayload)
    expect(targets.map((t) => t.service)).not.toContain('persistent_notification')
  })

  it('humanises the service id into a readable label', () => {
    const target = mapNotifyTargets(servicesPayload).find((t) => t.service === 'mobile_app_partner')
    expect(target?.name).toBe('Mobile app partner')
  })

  it('returns the targets sorted by label', () => {
    const names = mapNotifyTargets(servicesPayload).map((t) => t.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('returns an empty list when there is no notify domain', () => {
    expect(mapNotifyTargets([{ domain: 'light', services: {} }])).toEqual([])
  })

  it('tolerates a malformed payload', () => {
    expect(mapNotifyTargets(null)).toEqual([])
    expect(mapNotifyTargets({})).toEqual([])
    expect(mapNotifyTargets([{ domain: 'notify' }])).toEqual([])
  })
})

describe('criticalAlertData', () => {
  it('carries both the iOS critical and Android high-priority keys', () => {
    const data = criticalAlertData()
    // iOS: the critical sound payload that bypasses the ring switch / DND.
    expect(data).toMatchObject({ push: { sound: { critical: 1 } } })
    // Android: immediate, high-priority delivery.
    expect(data).toMatchObject({ ttl: 0, priority: 'high' })
  })
})
