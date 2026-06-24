/**
 * Pure helpers for the Home Assistant WebSocket protocol (spec §8.11). Kept
 * free of any socket so the auth state machine is unit-testable without a live
 * connection — the same split as the Ollama integration's pure parse helpers.
 *
 * HA's auth handshake (https://developers.home-assistant.io/docs/api/websocket):
 *   1. server → { type: 'auth_required', ha_version }
 *   2. client → { type: 'auth', access_token }
 *   3. server → { type: 'auth_ok', ha_version }  |  { type: 'auth_invalid', message }
 */

/** The next thing the client should do in response to an inbound HA message. */
export type AuthStep =
  | { kind: 'send-auth'; payload: { type: 'auth'; access_token: string }; haVersion: string | null }
  | { kind: 'authenticated'; haVersion: string | null }
  | { kind: 'auth-failed'; message: string }
  | { kind: 'ignore' }

interface HaMessage {
  type?: unknown
  ha_version?: unknown
  message?: unknown
}

/** Decide the response to one parsed HA message during the auth handshake. */
export function nextAuthStep(message: HaMessage, token: string): AuthStep {
  switch (message.type) {
    case 'auth_required':
      return {
        kind: 'send-auth',
        payload: { type: 'auth', access_token: token },
        haVersion: asString(message.ha_version),
      }
    case 'auth_ok':
      return { kind: 'authenticated', haVersion: asString(message.ha_version) }
    case 'auth_invalid':
      return { kind: 'auth-failed', message: asString(message.message) ?? 'Invalid access token' }
    default:
      return { kind: 'ignore' }
  }
}

/** Parse a raw WebSocket frame to an object, or null if it isn't JSON. */
export function parseMessage(raw: string): HaMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as HaMessage) : null
  } catch {
    return null
  }
}

/** Convert an HA base URL (http/https) to its WebSocket endpoint. */
export function toWebSocketUrl(httpUrl: string): string {
  const url = new URL(httpUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = url.pathname.replace(/\/+$/, '') + '/api/websocket'
  return url.toString()
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
