import { WebSocket } from 'ws'
import type { HaConnectionStatus } from '@hame/shared'
import { logger } from '../../lib/logger.js'
import { prisma } from '../../lib/prisma.js'
import { nextAuthStep, parseMessage, toWebSocketUrl } from './protocol.js'

/**
 * The API's single outbound WebSocket to Home Assistant (spec §8.11, §10 Phase 6).
 * A module-level singleton owning one connection: it authenticates, tracks
 * status, and reconnects with capped backoff. It never throws into the event
 * loop — a down HA just leaves the status `error`/`disconnected` and retries,
 * the same graceful-degrade contract as the cron syncs.
 *
 * Phase 6.1 stops at *authenticated + status*; event subscriptions land in 6.2.
 */

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 60_000
const SINGLETON_ID = 'singleton'

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

  getStatus(): HaStatus {
    return { status: this.status, haVersion: this.haVersion, lastError: this.lastError }
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
        break
      case 'authenticated':
        this.status = 'connected'
        this.lastError = null
        this.haVersion = step.haVersion ?? this.haVersion
        this.reconnectDelay = RECONNECT_BASE_MS
        logger.info({ haVersion: this.haVersion }, 'Home Assistant connected')
        void this.stampConnected()
        break
      case 'auth-failed':
        // A bad token won't fix itself by retrying — stop and surface it.
        this.status = 'auth_failed'
        this.lastError = step.message
        logger.warn({ message: step.message }, 'Home Assistant auth rejected')
        this.stopped = true
        this.teardownSocket()
        break
      case 'ignore':
        break
    }
  }

  private onClose(): void {
    this.ws = null
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
