import { describe, it, expect } from 'vitest'
import { HA_DASHBOARD_DOMAINS } from '@hame/shared'
import {
  entityDomain,
  isAllowedDomain,
  parseStateChangedEvent,
  projectHaState,
} from '../integrations/home-assistant/entities.js'

describe('entityDomain / isAllowedDomain', () => {
  it('extracts the domain and checks it against the whitelist', () => {
    expect(entityDomain('light.kitchen')).toBe('light')
    expect(isAllowedDomain('weather.home', HA_DASHBOARD_DOMAINS)).toBe(true)
    expect(isAllowedDomain('automation.morning', HA_DASHBOARD_DOMAINS)).toBe(false)
  })
})

describe('projectHaState', () => {
  it('projects a raw HA state into Hame shape', () => {
    const entity = projectHaState({
      entity_id: 'weather.home',
      state: 'sunny',
      attributes: { friendly_name: 'Home', temperature: 21 },
      last_changed: '2026-06-24T10:00:00Z',
    })
    expect(entity).toEqual({
      entityId: 'weather.home',
      domain: 'weather',
      state: 'sunny',
      friendlyName: 'Home',
      attributes: { friendly_name: 'Home', temperature: 21 },
      lastChanged: new Date('2026-06-24T10:00:00Z'),
    })
  })

  it('defaults a missing friendly name / attributes / timestamp', () => {
    const entity = projectHaState({ entity_id: 'sensor.x', state: '5' })
    expect(entity).toMatchObject({ friendlyName: null, attributes: {}, lastChanged: null })
  })

  it('rejects a state with no entity_id or state', () => {
    expect(projectHaState({ state: 'on' })).toBeNull()
    expect(projectHaState({ entity_id: 'light.x' })).toBeNull()
  })
})

describe('parseStateChangedEvent', () => {
  it('pulls the entity id and new state out of the event', () => {
    const parsed = parseStateChangedEvent({
      event_type: 'state_changed',
      data: { entity_id: 'light.kitchen', new_state: { entity_id: 'light.kitchen', state: 'on' } },
    })
    expect(parsed?.entityId).toBe('light.kitchen')
    expect(parsed?.newState).toEqual({ entity_id: 'light.kitchen', state: 'on' })
  })

  it('returns a null new_state when the entity was removed', () => {
    const parsed = parseStateChangedEvent({ data: { entity_id: 'light.x', new_state: null } })
    expect(parsed).toEqual({ entityId: 'light.x', newState: null })
  })

  it('rejects malformed events', () => {
    expect(parseStateChangedEvent(null)).toBeNull()
    expect(parseStateChangedEvent({ data: {} })).toBeNull()
  })
})
