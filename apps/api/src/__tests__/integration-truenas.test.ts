import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  formatUptime,
  mapTrueNasStatus,
  poolState,
  toTrueNasWsUrl,
} from '../integrations/providers/truenas.js'
import {
  getIntegrationProvider,
  registerBuiltInIntegrationProviders,
} from '../integrations/providers/index.js'

describe('toTrueNasWsUrl', () => {
  it('always upgrades to wss and points at /api/current (API keys need TLS)', () => {
    expect(toTrueNasWsUrl('https://truenas.local')).toBe('wss://truenas.local/api/current')
    // http is upgraded to wss too — TrueNAS revokes API keys sent over plain ws.
    expect(toTrueNasWsUrl('http://10.0.0.5:81/')).toBe('wss://10.0.0.5:81/api/current')
  })
})

describe('formatUptime', () => {
  it('formats days/hours/minutes sensibly', () => {
    expect(formatUptime(3 * 86_400 + 4 * 3600)).toBe('3d 4h')
    expect(formatUptime(4 * 3600 + 12 * 60)).toBe('4h 12m')
    expect(formatUptime(12 * 60)).toBe('12m')
  })
})

describe('formatBytes', () => {
  it('picks a sensible unit', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(4 * 1024 ** 3)).toBe('4.0 GB')
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.0 TB')
  })
})

describe('poolState', () => {
  it('maps pool health to a metric state', () => {
    expect(poolState('ONLINE', true)).toBe('ok')
    expect(poolState('DEGRADED', false)).toBe('warn')
    expect(poolState('FAULTED', false)).toBe('crit')
    expect(poolState(null, null)).toBe('unknown')
  })
})

describe('mapTrueNasStatus', () => {
  it('maps system.info + pool.query into normalised metrics', () => {
    const info = {
      hostname: 'nas',
      version: 'TrueNAS-SCALE-25.04',
      uptime_seconds: 3 * 86_400,
      loadavg: [0.42, 0.3, 0.2],
      physmem: 32 * 1024 ** 3,
    }
    const pools = [
      { name: 'tank', status: 'ONLINE', healthy: true, size: 1000, allocated: 450 },
      { name: 'backup', status: 'DEGRADED', healthy: false },
    ]
    const snap = mapTrueNasStatus(info, pools)
    expect(snap.metrics).toEqual([
      { label: 'Hostname', value: 'nas', state: 'unknown' },
      { label: 'Version', value: 'TrueNAS-SCALE-25.04', state: 'unknown' },
      { label: 'Uptime', value: '3d 0h', state: 'unknown' },
      { label: 'Load (1m)', value: '0.42', state: 'unknown' },
      { label: 'Memory', value: '32.0 GB', state: 'unknown' },
      { label: 'Pool: tank', value: 'ONLINE · 45% used', state: 'ok' },
      { label: 'Pool: backup', value: 'DEGRADED', state: 'warn' },
    ])
  })

  it('degrades gracefully when fields are missing (no throw, fewer tiles)', () => {
    const snap = mapTrueNasStatus({}, [{ name: 'tank' }])
    expect(snap.metrics).toEqual([{ label: 'Pool: tank', value: 'OK', state: 'unknown' }])
  })
})

describe('registerBuiltInIntegrationProviders', () => {
  it('wires TrueNAS as a STATUS provider', () => {
    registerBuiltInIntegrationProviders()
    expect(getIntegrationProvider('truenas')?.kind).toBe('STATUS')
  })
})
