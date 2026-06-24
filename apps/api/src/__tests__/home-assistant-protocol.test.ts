import { describe, it, expect } from 'vitest'
import {
  nextAuthStep,
  parseMessage,
  toWebSocketUrl,
} from '../integrations/home-assistant/protocol.js'

describe('nextAuthStep', () => {
  it('responds to auth_required by sending the token', () => {
    const step = nextAuthStep({ type: 'auth_required', ha_version: '2026.6.1' }, 'tok')
    expect(step).toEqual({
      kind: 'send-auth',
      payload: { type: 'auth', access_token: 'tok' },
      haVersion: '2026.6.1',
    })
  })

  it('treats auth_ok as authenticated and captures the version', () => {
    expect(nextAuthStep({ type: 'auth_ok', ha_version: '2026.6.1' }, 'tok')).toEqual({
      kind: 'authenticated',
      haVersion: '2026.6.1',
    })
  })

  it('treats auth_invalid as a failure with its message', () => {
    expect(nextAuthStep({ type: 'auth_invalid', message: 'Invalid password' }, 'tok')).toEqual({
      kind: 'auth-failed',
      message: 'Invalid password',
    })
  })

  it('ignores other message types (e.g. events)', () => {
    expect(nextAuthStep({ type: 'event' }, 'tok')).toEqual({ kind: 'ignore' })
  })
})

describe('parseMessage', () => {
  it('parses JSON objects and rejects non-JSON / non-objects', () => {
    expect(parseMessage('{"type":"auth_ok"}')).toEqual({ type: 'auth_ok' })
    expect(parseMessage('not json')).toBeNull()
    expect(parseMessage('42')).toBeNull()
  })
})

describe('toWebSocketUrl', () => {
  it('maps http→ws and https→wss and appends /api/websocket', () => {
    expect(toWebSocketUrl('http://homeassistant.local:8123')).toBe(
      'ws://homeassistant.local:8123/api/websocket',
    )
    expect(toWebSocketUrl('https://ha.example.com/')).toBe('wss://ha.example.com/api/websocket')
  })
})
