import { describe, it, expect } from 'vitest'
import {
  criticalAlertData,
  enrichWithDeviceNames,
  mapNotifyTargets,
  slugifyDeviceName,
} from '../integrations/home-assistant/notifications.js'

/** A trimmed shape of HA's `GET /api/services` payload — the `notify` domain
 *  carries far more than phones (Alexa media players, groups, scripts). */
const servicesPayload = [
  { domain: 'light', services: { turn_on: {}, turn_off: {} } },
  {
    domain: 'notify',
    services: {
      mobile_app_bens_phone: { name: 'Bens phone' },
      mobile_app_partner: {},
      alexa_media_hallway_pop: {},
      alexa_media_kitchen_pop: {},
      notify: {},
      send_message: {},
      persistent_notification: {},
    },
  },
]

describe('mapNotifyTargets', () => {
  it('extracts the mobile-app devices as pickable targets', () => {
    const targets = mapNotifyTargets(servicesPayload)
    const services = targets.map((t) => t.service)
    expect(services).toContain('mobile_app_bens_phone')
    expect(services).toContain('mobile_app_partner')
  })

  it('excludes non-phone notify services (Alexa, groups, scripts)', () => {
    const services = mapNotifyTargets(servicesPayload).map((t) => t.service)
    expect(services).not.toContain('alexa_media_hallway_pop')
    expect(services).not.toContain('alexa_media_kitchen_pop')
    expect(services).not.toContain('notify')
    expect(services).not.toContain('send_message')
    expect(services).not.toContain('persistent_notification')
    // Only the two mobile-app devices survive.
    expect(services).toHaveLength(2)
  })

  it('humanises the service id into a readable label, prefix stripped', () => {
    const target = mapNotifyTargets(servicesPayload).find((t) => t.service === 'mobile_app_partner')
    expect(target?.name).toBe('Partner')
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

describe('slugifyDeviceName', () => {
  it('matches HA slugify for real device names', () => {
    expect(slugifyDeviceName('SM-S918B')).toBe('sm_s918b')
    expect(slugifyDeviceName('Galaxy Watch5 (1RAB)')).toBe('galaxy_watch5_1rab')
    expect(slugifyDeviceName("Ben's iPhone")).toBe('ben_s_iphone')
  })
})

describe('enrichWithDeviceNames', () => {
  // The three real mobile-app services on the test HA.
  const targets = mapNotifyTargets([
    {
      domain: 'notify',
      services: {
        mobile_app_sm_s918b: {},
        mobile_app_galaxy_watch5_1rab: {},
        mobile_app_partner: {},
      },
    },
  ])

  // A device-registry payload shaped like HA's config/device_registry/list.
  const devices = [
    { name: 'SM-S918B', name_by_user: null, identifiers: [['mobile_app', '0ee0']] },
    { name: 'Galaxy Watch5 (1RAB)', name_by_user: null, identifiers: [['mobile_app', '0b49']] },
    // A non-mobile-app device is ignored even if its slug would collide.
    { name: 'Living Room TV', name_by_user: null, identifiers: [['cast', 'abcd']] },
  ]

  it('replaces slug labels with the registration name (proper casing/parens)', () => {
    const byService = Object.fromEntries(
      enrichWithDeviceNames(targets, devices).map((t) => [t.service, t.name]),
    )
    expect(byService['mobile_app_sm_s918b']).toBe('SM-S918B')
    expect(byService['mobile_app_galaxy_watch5_1rab']).toBe('Galaxy Watch5 (1RAB)')
  })

  it('prefers a user rename over the registration name', () => {
    const renamed = [
      { name: 'SM-S918B', name_by_user: "Ben's phone", identifiers: [['mobile_app', 'x']] },
    ]
    const byService = Object.fromEntries(
      enrichWithDeviceNames(targets, renamed).map((t) => [t.service, t.name]),
    )
    expect(byService['mobile_app_sm_s918b']).toBe("Ben's phone")
  })

  it('keeps the slug-derived label when no device matches', () => {
    const byService = Object.fromEntries(
      enrichWithDeviceNames(targets, devices).map((t) => [t.service, t.name]),
    )
    // No device registered for mobile_app_partner → humanised fallback stands.
    expect(byService['mobile_app_partner']).toBe('Partner')
  })

  it('returns the targets unchanged when the registry is empty', () => {
    expect(enrichWithDeviceNames(targets, [])).toEqual(targets)
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
