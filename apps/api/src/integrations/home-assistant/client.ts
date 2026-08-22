import { WebSocket } from 'ws'
import type { HaEntityState } from '@hame/shared'
import { HA_DASHBOARD_DOMAINS, type HaConnectionStatus } from '@hame/shared'
import { logger } from '../../lib/logger.js'
import { prisma } from '../../lib/prisma.js'
import { nextAuthStep, parseMessage, toWebSocketUrl } from './protocol.js'
import {
  isAllowedDomain,
  parseStateChangedEvent,
  projectHaState,
  type RawHaState,
} from './entities.js'

/** Notified on every dashboard-relevant entity change (drives the SSE stream). */
export type EntityListener = (entity: HaEntityState) => void

/** Notified when a tracked entity is removed from Home Assistant. */
export type EntityRemovalListener = (entityId: string) => void

/**
 * The API's single outbound WebSocket to Home Assistant (spec §8.11, §10 Phase 6).
 * A module-level singleton owning one connection: it authenticates, tracks
 * status, and reconnects with capped backoff. It never throws into the event
 * loop — a down HA just leaves the status `error`/`disconnected` and retries,
 * the same graceful-degrade contract as the cron syncs.
 *
 * Once authenticated it seeds an in-memory registry via `get_states` and keeps
 * it live by subscribing to `state_changed` (spec §10 Phase 6.2), scoped to the
 * dashboard domains. The registry is never persisted (§8.11, no state mirroring).
 */

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 60_000
const COMMAND_TIMEOUT_MS = 10_000
const SINGLETON_ID = 'singleton'

/** Pull HA's own explanation out of a `result` frame's `error` object, so a
 *  rejected command surfaces *why* rather than a generic message. */
function haErrorReason(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  return String((error as { message?: unknown }).message ?? fallback)
}

/** A `call_service` command awaiting its `result` frame from HA. */
interface PendingCommand {
  resolve: () => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/** A read-only WS request awaiting its `result` frame — resolves the payload. */
interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

interface HaSettings {
  url: string
  token: string
}

export interface HaStatus {
  status: HaConnectionStatus
  haVersion: string | null
  lastError: string | null
}

class HomeAssistantClient {
  private settings: HaSettings | null = null
  private ws: WebSocket | null = null
  private status: HaConnectionStatus = 'disconnected'
  private haVersion: string | null = null
  private lastError: string | null = null
  private reconnectDelay = RECONNECT_BASE_MS
  private reconnectTimer: NodeJS.Timeout | null = null
  /** Guards against a scheduled reconnect firing after an intentional stop. */
  private stopped = true

  // ── Entity registry (in-memory only — spec §8.11, no state mirroring) ──
  private commandId = 0
  private getStatesId = 0
  private readonly entities = new Map<string, HaEntityState>()
  private readonly listeners = new Set<EntityListener>()
  private readonly removalListeners = new Set<EntityRemovalListener>()
  /** In-flight `call_service` commands, keyed by their command id. */
  private readonly pending = new Map<number, PendingCommand>()
  /** In-flight read-only requests (e.g. the device registry), keyed by command id. */
  private readonly pendingRequests = new Map<number, PendingRequest>()

  getStatus(): HaStatus {
    return { status: this.status, haVersion: this.haVersion, lastError: this.lastError }
  }

  /**
   * Relay a Home Assistant `call_service` command over the live socket (spec
   * §8.11, §10 Phase 6.3) and resolve once HA acknowledges it. Rejects if the
   * link is down or HA reports failure — the caller (control service) maps that
   * to a graceful `{ ok: false }`, never a thrown request. The (domain, service)
   * pair is allowlisted by the schema before it reaches here, and `data` — the
   * arguments a setpoint-style service needs — has been re-parsed against that
   * service's declared shape, so only known keys reach the socket.
   */
  callService(
    domain: string,
    service: string,
    entityId: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const socket = this.ws
    if (this.status !== 'connected' || !socket) {
      return Promise.reject(new Error('Home Assistant is not connected'))
    }
    const id = ++this.commandId
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => this.settlePending(id, new Error('Home Assistant did not respond in time')),
        COMMAND_TIMEOUT_MS,
      )
      this.pending.set(id, { resolve, reject, timer })
      try {
        socket.send(
          JSON.stringify({
            id,
            type: 'call_service',
            domain,
            service,
            ...(data && Object.keys(data).length > 0 && { service_data: data }),
            target: { entity_id: entityId },
          }),
        )
      } catch (err) {
        this.settlePending(id, err instanceof Error ? err : new Error('Failed to send command'))
      }
    })
  }

  /**
   * Fetch Home Assistant's device registry over the live socket (spec §10 Phase 8).
   * Read-only, and HA exposes it only over WS (no REST equivalent); used to resolve
   * the friendly names behind the mobile-app notify services. Resolves the raw
   * device array, or rejects if the link is down / HA errors — the caller then
   * degrades to the slug-derived labels.
   */
  async fetchDeviceRegistry(): Promise<unknown[]> {
    const result = await this.request('config/device_registry/list')
    return Array.isArray(result) ? result : []
  }

  /**
   * Fetch a weather entity's forecast over the live socket (spec §10, weather
   * forecast modal). Home Assistant exposes this as the `weather.get_forecasts`
   * *action* with response data, not a standalone WS command — confirmed live
   * against a real server, which rejects a bare `weather/get_forecasts` command
   * with "Unknown command." So it rides `call_service` with `return_response:
   * true`, HA's general mechanism for an action that talks back; the answer
   * arrives nested under the result's `response` key, keyed by entity id — left
   * raw here for the pure `mapHaForecast` helper to parse and project.
   */
  async getForecast(entityId: string, forecastType: 'hourly' | 'daily'): Promise<unknown> {
    const result = await this.request('call_service', {
      domain: 'weather',
      service: 'get_forecasts',
      service_data: { type: forecastType },
      target: { entity_id: entityId },
      return_response: true,
    })
    return result && typeof result === 'object' ? (result as { response?: unknown }).response : null
  }

  /** Send a read-only WS command and resolve with its `result` payload. Separate
   *  from {@link callService}'s pending map, so the control path is untouched. */
  private request(type: string, extra?: Record<string, unknown>): Promise<unknown> {
    const socket = this.ws
    if (this.status !== 'connected' || !socket) {
      return Promise.reject(new Error('Home Assistant is not connected'))
    }
    const id = ++this.commandId
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => this.settleRequest(id, new Error('Home Assistant did not respond in time')),
        COMMAND_TIMEOUT_MS,
      )
      this.pendingRequests.set(id, { resolve, reject, timer })
      try {
        socket.send(JSON.stringify({ id, type, ...extra }))
      } catch (err) {
        this.settleRequest(id, err instanceof Error ? err : new Error('Failed to send request'))
      }
    })
  }

  /** Resolve or reject one pending read-only request, clearing its timeout. */
  private settleRequest(id: number, error: Error | null, result?: unknown): void {
    const request = this.pendingRequests.get(id)
    if (!request) return
    clearTimeout(request.timer)
    this.pendingRequests.delete(id)
    if (error) request.reject(error)
    else request.resolve(result)
  }

  /** Current dashboard-relevant entity states (empty until connected). */
  getEntities(): HaEntityState[] {
    return [...this.entities.values()]
  }

  /** One entity's current state, or null if it isn't tracked (or HA is down). */
  getEntity(entityId: string): HaEntityState | null {
    return this.entities.get(entityId) ?? null
  }

  /** Subscribe to live entity changes; returns an unsubscribe fn. */
  onEntityUpdate(listener: EntityListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Subscribe to entity removals (a device deleted in HA); returns unsubscribe. */
  onEntityRemove(listener: EntityRemovalListener): () => void {
    this.removalListeners.add(listener)
    return () => this.removalListeners.delete(listener)
  }

  /** Connect with the given settings, replacing any existing connection. */
  start(settings: HaSettings): void {
    this.settings = settings
    this.stopped = false
    this.reconnectDelay = RECONNECT_BASE_MS
    this.openSocket()
  }

  /** Close the connection and stop reconnecting (config disabled or shutdown). */
  stop(): void {
    this.stopped = true
    this.clearReconnect()
    this.teardownSocket()
    this.settings = null
    this.status = 'disconnected'
    this.haVersion = null
    this.lastError = null
    this.entities.clear()
    this.rejectAllPending('Home Assistant disconnected')
  }

  /** Re-read settings and reconnect — called when the saved config changes. */
  reload(settings: HaSettings | null): void {
    if (!settings) {
      this.stop()
      return
    }
    this.clearReconnect()
    this.teardownSocket()
    this.start(settings)
  }

  private openSocket(): void {
    if (!this.settings) return
    this.status = 'connecting'
    let socket: WebSocket
    try {
      socket = new WebSocket(toWebSocketUrl(this.settings.url))
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'Invalid Home Assistant URL')
      this.scheduleReconnect()
      return
    }
    this.ws = socket

    socket.on('message', (data) => this.onMessage(data.toString()))
    socket.on('close', () => this.onClose())
    socket.on('error', (err) => {
      this.lastError = err.message
      // 'close' fires after 'error' and drives the reconnect; just record here.
      logger.warn({ err }, 'Home Assistant socket error')
    })
  }

  private onMessage(raw: string): void {
    if (!this.settings) return
    const message = parseMessage(raw)
    if (!message) return
    const step = nextAuthStep(message, this.settings.token)
    switch (step.kind) {
      case 'send-auth':
        this.haVersion = step.haVersion
        this.ws?.send(JSON.stringify(step.payload))
        return
      case 'authenticated':
        this.status = 'connected'
        this.lastError = null
        this.haVersion = step.haVersion ?? this.haVersion
        this.reconnectDelay = RECONNECT_BASE_MS
        logger.info({ haVersion: this.haVersion }, 'Home Assistant connected')
        void this.stampConnected()
        this.subscribeToEntities()
        return
      case 'auth-failed':
        // A bad token won't fix itself by retrying — stop and surface it.
        this.status = 'auth_failed'
        this.lastError = step.message
        logger.warn({ message: step.message }, 'Home Assistant auth rejected')
        this.stopped = true
        this.teardownSocket()
        return
      case 'ignore':
        if (this.status === 'connected') this.onRuntimeMessage(message)
        return
    }
  }

  /** Once authenticated: seed the registry with all states, then subscribe. */
  private subscribeToEntities(): void {
    this.entities.clear()
    this.getStatesId = ++this.commandId
    this.send({ id: this.getStatesId, type: 'get_states' })
    this.send({ id: ++this.commandId, type: 'subscribe_events', event_type: 'state_changed' })
  }

  /** Handle post-auth frames: the `get_states` result and `state_changed` events. */
  private onRuntimeMessage(message: {
    id?: unknown
    type?: unknown
    result?: unknown
    event?: unknown
    success?: unknown
    error?: unknown
  }): void {
    // A `call_service` acknowledgement for a command we're awaiting.
    if (
      message.type === 'result' &&
      typeof message.id === 'number' &&
      this.pending.has(message.id)
    ) {
      const ok = message.success !== false
      const reason = haErrorReason(message.error, 'Home Assistant rejected the command')
      this.settlePending(message.id, ok ? null : new Error(reason))
      return
    }
    // A read-only request's result (e.g. the device registry, a forecast).
    if (
      message.type === 'result' &&
      typeof message.id === 'number' &&
      this.pendingRequests.has(message.id)
    ) {
      const ok = message.success !== false
      const reason = haErrorReason(message.error, 'Home Assistant rejected the request')
      this.settleRequest(message.id, ok ? null : new Error(reason), message.result)
      return
    }
    if (message.type === 'result' && message.id === this.getStatesId) {
      if (Array.isArray(message.result)) {
        for (const raw of message.result as RawHaState[]) this.ingest(raw, false)
      }
      return
    }
    if (message.type === 'event') {
      const changed = parseStateChangedEvent(message.event)
      if (!changed) return
      // A `new_state` of null means the entity was deleted in HA (not merely
      // offline — that arrives as a state of `unavailable`). Drop it so the
      // dashboard and curated lists stop showing a device that no longer exists.
      if (changed.newState) this.ingest(changed.newState, true)
      else this.remove(changed.entityId)
    }
  }

  /** Register one raw state if it's a dashboard domain; emit when `notify`. */
  private ingest(raw: RawHaState, notify: boolean): void {
    const entity = projectHaState(raw)
    if (!entity || !isAllowedDomain(entity.entityId, HA_DASHBOARD_DOMAINS)) return
    this.entities.set(entity.entityId, entity)
    if (notify) for (const listener of this.listeners) listener(entity)
  }

  /** Drop a deleted entity from the registry and notify removal listeners. */
  private remove(entityId: string): void {
    if (!this.entities.delete(entityId)) return // wasn't a tracked entity
    for (const listener of this.removalListeners) listener(entityId)
  }

  private send(payload: Record<string, unknown>): void {
    this.ws?.send(JSON.stringify(payload))
  }

  /** Resolve or reject one pending command, clearing its timeout. */
  private settlePending(id: number, error: Error | null): void {
    const command = this.pending.get(id)
    if (!command) return
    clearTimeout(command.timer)
    this.pending.delete(id)
    if (error) command.reject(error)
    else command.resolve()
  }

  /** Fail every in-flight command/request — the link dropped before they acked. */
  private rejectAllPending(reason: string): void {
    for (const command of this.pending.values()) {
      clearTimeout(command.timer)
      command.reject(new Error(reason))
    }
    this.pending.clear()
    for (const request of this.pendingRequests.values()) {
      clearTimeout(request.timer)
      request.reject(new Error(reason))
    }
    this.pendingRequests.clear()
  }

  private onClose(): void {
    this.ws = null
    this.entities.clear() // stale once the link drops; re-seeded on reconnect
    this.rejectAllPending('Home Assistant connection lost')
    if (this.stopped) return // intentional stop or auth failure
    if (this.status !== 'auth_failed') this.status = 'error'
    this.scheduleReconnect()
  }

  private fail(message: string): void {
    this.status = 'error'
    this.lastError = message
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = this.reconnectDelay
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private teardownSocket(): void {
    if (!this.ws) return
    this.ws.removeAllListeners()
    try {
      this.ws.close()
    } catch {
      // already closing
    }
    this.ws = null
  }

  private async stampConnected(): Promise<void> {
    await prisma.homeAssistantConfig
      .updateMany({ where: { id: SINGLETON_ID }, data: { lastConnectedAt: new Date() } })
      .catch(() => undefined)
  }
}

/** The process-wide Home Assistant connection. */
export const haClient = new HomeAssistantClient()
