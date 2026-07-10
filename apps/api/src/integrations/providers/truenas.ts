/**
 * TrueNAS Scale status provider (spec §10 Phase 10.2 — the reference STATUS
 * provider, and the framework's transport stress-test). Unlike Gitea's plain HTTP
 * GET, TrueNAS speaks **JSON-RPC 2.0 over a WebSocket** (`/api/current`): the REST
 * API is deprecated in 25.04 and removed in 26. We connect → authenticate with a
 * service-account API key → read `system.info` + `pool.query` → close, once per
 * poll (no persistent socket — this is a periodic status read, not live push).
 *
 * TLS is required: TrueNAS revokes a user-linked API key sent over plain `ws://`,
 * so the URL is upgraded to `wss://`. Homelab TrueNAS typically ships a
 * self-signed certificate, so — like a `midclt --insecure` call — certificate
 * validation is relaxed for this admin-configured LAN service (spec §8.6: the
 * SSRF/verification guards are for arbitrary user URLs, not configured integrations).
 *
 * {@link mapTrueNasStatus} and {@link toTrueNasWsUrl} are pure and unit-tested;
 * {@link callTrueNas} is the thin WebSocket round-trip.
 */
import { WebSocket } from 'ws'
import { z } from 'zod'
import type { IntegrationMetric, IntegrationSnapshot } from '@hame/shared'
import type { IntegrationContext, StatusIntegrationProvider } from './index.js'

const CALL_TIMEOUT_MS = 15_000

const TrueNasConfigSchema = z.object({ url: z.string().url() })

/** Convert a TrueNAS web URL to its JSON-RPC WebSocket endpoint (always TLS). */
export function toTrueNasWsUrl(webUrl: string): string {
  const url = new URL(webUrl)
  // API-key auth is rejected over plain ws://, so always use wss:// (spec note above).
  url.protocol = 'wss:'
  url.pathname = url.pathname.replace(/\/+$/, '') + '/api/current'
  url.search = ''
  return url.toString()
}

// ── Pure status mapping ──────────────────────────────────────────────────────

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** "3d 4h" / "4h 12m" / "12m" from an uptime in seconds. */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400)
  const h = Math.floor((seconds % 86_400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** Human byte size ("3.6 TB") with a sensible unit. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

/** A pool's health → metric state. ONLINE/healthy is ok; DEGRADED warns; the rest crit. */
export function poolState(
  status: string | null,
  healthy: boolean | null,
): IntegrationMetric['state'] {
  if (healthy === true || status === 'ONLINE') return 'ok'
  if (status === 'DEGRADED') return 'warn'
  if (status && ['FAULTED', 'OFFLINE', 'REMOVED', 'UNAVAIL'].includes(status)) return 'crit'
  return healthy === false ? 'crit' : 'unknown'
}

/**
 * Turn a TrueNAS `system.info` object and `pool.query` array into normalised
 * metrics for the generic status widget. Defensive: unknown/missing fields are
 * skipped rather than throwing, so a schema drift degrades to fewer tiles.
 */
export function mapTrueNasStatus(info: unknown, pools: unknown[]): IntegrationSnapshot {
  const metrics: IntegrationMetric[] = []
  const i = (info ?? {}) as Record<string, unknown>

  const hostname = asString(i.hostname)
  if (hostname) metrics.push({ label: 'Hostname', value: hostname, state: 'unknown' })

  const version = asString(i.version)
  if (version) metrics.push({ label: 'Version', value: version, state: 'unknown' })

  const uptime = asNumber(i.uptime_seconds)
  if (uptime !== null)
    metrics.push({ label: 'Uptime', value: formatUptime(uptime), state: 'unknown' })

  const loadavg = Array.isArray(i.loadavg) ? asNumber(i.loadavg[0]) : null
  if (loadavg !== null)
    metrics.push({ label: 'Load (1m)', value: loadavg.toFixed(2), state: 'unknown' })

  const physmem = asNumber(i.physmem)
  if (physmem !== null)
    metrics.push({ label: 'Memory', value: formatBytes(physmem), state: 'unknown' })

  for (const raw of pools) {
    const pool = (raw ?? {}) as Record<string, unknown>
    const name = asString(pool.name)
    if (!name) continue
    const status = asString(pool.status)
    const healthy = typeof pool.healthy === 'boolean' ? pool.healthy : null
    const size = asNumber(pool.size)
    const allocated = asNumber(pool.allocated)
    const usedPct =
      size && size > 0 && allocated !== null ? Math.round((allocated / size) * 100) : null
    const parts = [status ?? (healthy === false ? 'UNHEALTHY' : 'OK')]
    if (usedPct !== null) parts.push(`${usedPct}% used`)
    metrics.push({
      label: `Pool: ${name}`,
      value: parts.join(' · '),
      state: poolState(status, healthy),
    })
  }

  return { metrics }
}

// ── WebSocket JSON-RPC round-trip ────────────────────────────────────────────

interface RpcResponse {
  id?: unknown
  result?: unknown
  error?: { message?: unknown } | null
}

/**
 * Connect, authenticate with the API key, run the read-only calls, and close.
 * Rejects (never hangs) on a timeout, socket error, bad key, or RPC error — the
 * service maps that to `lastError` and keeps the last snapshot (spec §9.6).
 */
async function callTrueNas(
  webUrl: string,
  apiKey: string,
): Promise<{ info: unknown; pools: unknown[] }> {
  const wsUrl = toTrueNasWsUrl(webUrl)
  return new Promise((resolve, reject) => {
    // Relax cert validation for the self-signed cert homelab TrueNAS ships with
    // (the `midclt --insecure` equivalent); this is an admin-configured LAN host.
    const socket = new WebSocket(wsUrl, { rejectUnauthorized: false })
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
    let nextId = 1
    let settled = false

    const timer = setTimeout(
      () => finish(new Error('TrueNAS did not respond in time')),
      CALL_TIMEOUT_MS,
    )

    function cleanup(): void {
      clearTimeout(timer)
      socket.removeAllListeners()
      try {
        socket.close()
      } catch {
        // already closing
      }
    }
    function finish(err: Error): void {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }
    function done(value: { info: unknown; pools: unknown[] }): void {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    function call(method: string, params: unknown[]): Promise<unknown> {
      const id = nextId++
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej })
        socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      })
    }

    socket.on('message', (data) => {
      let msg: RpcResponse
      try {
        msg = JSON.parse(data.toString()) as RpcResponse
      } catch {
        return
      }
      if (typeof msg.id !== 'number') return
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(asString(msg.error.message) ?? 'TrueNAS returned an error'))
      else p.resolve(msg.result)
    })
    socket.on('error', (err) =>
      finish(new Error(err instanceof Error ? err.message : 'Could not reach TrueNAS')),
    )
    socket.on('close', () => finish(new Error('TrueNAS closed the connection')))
    socket.on('open', () => {
      void (async () => {
        try {
          const authed = await call('auth.login_with_api_key', [apiKey])
          if (authed !== true) throw new Error('The API key was rejected')
          const info = await call('system.info', [])
          const pools = await call('pool.query', [])
          done({ info, pools: Array.isArray(pools) ? pools : [] })
        } catch (err) {
          finish(err instanceof Error ? err : new Error('TrueNAS request failed'))
        }
      })()
    })
  })
}

function readConfig(config: Record<string, unknown>): string {
  const parsed = TrueNasConfigSchema.safeParse(config)
  if (!parsed.success) throw new Error('TrueNAS needs a server URL')
  return parsed.data.url
}

export const truenasProvider: StatusIntegrationProvider = {
  id: 'truenas',
  name: 'TrueNAS Scale',
  kind: 'STATUS',
  description: 'Pool health, capacity and system status from a TrueNAS Scale server.',
  configFields: [
    {
      key: 'url',
      label: 'Server URL',
      type: 'url',
      placeholder: 'https://truenas.local',
      help: 'Must be https — TrueNAS rejects API keys over plain http.',
      required: true,
    },
  ],
  secretFields: [
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      help: 'A user-linked API key (Credentials → Local Users → API keys). A read-only service account is ideal.',
      required: true,
    },
  ],

  async test(ctx: IntegrationContext): Promise<void> {
    if (!ctx.secret) throw new Error('An API key is required')
    await callTrueNas(readConfig(ctx.config), ctx.secret)
  },

  async fetchSnapshot(ctx: IntegrationContext): Promise<IntegrationSnapshot> {
    if (!ctx.secret) throw new Error('An API key is required')
    const { info, pools } = await callTrueNas(readConfig(ctx.config), ctx.secret)
    return mapTrueNasStatus(info, pools)
  },
}
