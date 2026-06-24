import type { HaEntityState } from '@hame/shared'

/**
 * Pure helpers for the Home Assistant entity registry (spec §8.11, §10 Phase 6.2).
 * Kept socket-free so projection and event parsing are unit-tested without a live
 * connection — the same split as the auth protocol helpers.
 */

/** HA's raw state object, as returned by `get_states` and inside events. */
export interface RawHaState {
  entity_id?: unknown
  state?: unknown
  attributes?: unknown
  last_changed?: unknown
}

/** The domain portion of an entity id ("light.kitchen" → "light"). */
export function entityDomain(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

export function isAllowedDomain(entityId: string, allowed: readonly string[]): boolean {
  return allowed.includes(entityDomain(entityId))
}

/** Project a raw HA state to Hame's entity shape, or null if it's unusable. */
export function projectHaState(raw: RawHaState): HaEntityState | null {
  if (typeof raw.entity_id !== 'string' || typeof raw.state !== 'string') return null
  const attributes =
    raw.attributes && typeof raw.attributes === 'object'
      ? (raw.attributes as Record<string, unknown>)
      : {}
  const friendlyName = attributes.friendly_name
  return {
    entityId: raw.entity_id,
    domain: entityDomain(raw.entity_id),
    state: raw.state,
    friendlyName: typeof friendlyName === 'string' ? friendlyName : null,
    attributes,
    lastChanged: typeof raw.last_changed === 'string' ? new Date(raw.last_changed) : null,
  }
}

/** Pull the entity id + new raw state out of a `state_changed` event payload. */
export function parseStateChangedEvent(
  event: unknown,
): { entityId: string; newState: RawHaState | null } | null {
  if (!event || typeof event !== 'object') return null
  const data = (event as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const entityId = (data as { entity_id?: unknown }).entity_id
  if (typeof entityId !== 'string') return null
  const newState = (data as { new_state?: unknown }).new_state
  return {
    entityId,
    newState: newState && typeof newState === 'object' ? (newState as RawHaState) : null,
  }
}
