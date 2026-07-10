import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'
import {
  registerIntegrationProvider,
  type CalendarIntegrationProvider,
  type StatusIntegrationProvider,
} from '../integrations/providers/index.js'

const integration = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const integrationEvent = { deleteMany: vi.fn(), createMany: vi.fn() }
const $transaction = vi.fn(async (ops: unknown) => ops)

vi.mock('../lib/prisma.js', () => ({
  prisma: { integration, integrationEvent, $transaction },
}))

// A controllable STATUS provider registered into the real registry the service reads.
const statusTest = vi.fn(async () => {})
const statusFetch = vi.fn(async () => ({
  metrics: [{ label: 'CPU', value: '5%', state: 'ok' as const }],
}))
const statusProvider: StatusIntegrationProvider = {
  id: 'fake-status',
  name: 'Fake Status',
  kind: 'STATUS',
  description: '',
  configFields: [],
  secretFields: [],
  test: statusTest,
  fetchSnapshot: statusFetch,
}
const calFetch = vi.fn(async () => [
  { externalId: 'm:1', title: 'Due', startTime: new Date('2026-08-01T00:00:00Z'), allDay: true },
])
const calendarProvider: CalendarIntegrationProvider = {
  id: 'fake-cal',
  name: 'Fake Calendar',
  kind: 'CALENDAR',
  description: '',
  configFields: [],
  secretFields: [],
  test: vi.fn(async () => {}),
  fetchEvents: calFetch,
}
registerIntegrationProvider(statusProvider)
registerIntegrationProvider(calendarProvider)

const service = await import('../services/integration.service.js')

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'int-1',
    providerId: 'fake-status',
    kind: 'STATUS',
    name: 'NAS',
    config: {},
    secret: null,
    isActive: true,
    pollIntervalSeconds: 900,
    snapshot: null,
    lastSyncedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toPublic (read shape)', () => {
  it('exposes only whether a secret is stored, never the secret itself', async () => {
    integration.findMany.mockResolvedValue([row({ secret: encryptSecret('tok') })])
    const [pub] = await service.listIntegrations()
    expect(pub.hasSecret).toBe(true)
    expect(pub).not.toHaveProperty('secret')
  })

  it('reports hasSecret=false when none is stored and parses a stored snapshot', async () => {
    integration.findMany.mockResolvedValue([
      row({
        secret: null,
        snapshot: { metrics: [{ label: 'Pool', value: 'ONLINE', state: 'ok' }] },
      }),
    ])
    const [pub] = await service.listIntegrations()
    expect(pub.hasSecret).toBe(false)
    expect(pub.snapshot?.metrics[0].value).toBe('ONLINE')
  })
})

describe('createIntegration', () => {
  it('encrypts the secret at rest and derives the kind from the provider', async () => {
    integration.create.mockResolvedValue(row({ isActive: false, secret: encryptSecret('tok') }))
    integration.findUnique.mockResolvedValue(row({ isActive: false, secret: encryptSecret('tok') }))

    await service.createIntegration({
      providerId: 'fake-status',
      name: 'NAS',
      config: {},
      secret: 'tok',
      isActive: false,
    })

    const data = integration.create.mock.calls[0][0].data
    expect(data.kind).toBe('STATUS') // derived from the provider, not the input
    expect(data.secret).not.toBe('tok')
    expect(decryptSecret(data.secret)).toBe('tok')
  })

  it('rejects an unknown provider', async () => {
    await expect(
      service.createIntegration({ providerId: 'nope', name: 'x', config: {} }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('updateIntegration', () => {
  it('leaves the stored secret untouched when none is supplied', async () => {
    integration.findUnique.mockResolvedValue(row({ isActive: false }))
    integration.update.mockResolvedValue(row({ isActive: false }))
    await service.updateIntegration('int-1', { name: 'Renamed' })
    expect(integration.update.mock.calls[0][0].data).not.toHaveProperty('secret')
  })
})

describe('testIntegration (never throws)', () => {
  it('returns ok:false for an unknown provider', async () => {
    expect(await service.testIntegration({ providerId: 'nope', config: {} })).toEqual({
      ok: false,
      message: expect.stringContaining('nope'),
    })
  })

  it('returns ok:false with the message when the provider test throws', async () => {
    statusTest.mockRejectedValueOnce(new Error('boom'))
    expect(await service.testIntegration({ providerId: 'fake-status', config: {} })).toEqual({
      ok: false,
      message: 'boom',
    })
  })

  it('returns ok:true when the provider test resolves', async () => {
    expect((await service.testIntegration({ providerId: 'fake-status', config: {} })).ok).toBe(true)
  })
})

describe('pollIntegration', () => {
  it('writes a fresh STATUS snapshot and clears lastError on success', async () => {
    integration.findUnique.mockResolvedValue(row())
    integration.update.mockResolvedValue(row())
    await service.pollIntegration('int-1')

    const data = integration.update.mock.calls.at(-1)?.[0].data
    expect(data.snapshot).toEqual({ metrics: [{ label: 'CPU', value: '5%', state: 'ok' }] })
    expect(data.lastError).toBeNull()
    expect(data.lastSyncedAt).toBeInstanceOf(Date)
  })

  it('records lastError and keeps prior data when the provider fails', async () => {
    statusFetch.mockRejectedValueOnce(new Error('unreachable'))
    integration.findUnique.mockResolvedValue(row())
    integration.update.mockResolvedValue(row())
    await service.pollIntegration('int-1')

    const data = integration.update.mock.calls.at(-1)?.[0].data
    expect(data).toEqual({ lastError: 'unreachable' })
  })

  it('replaces cached events wholesale for a CALENDAR provider', async () => {
    integration.findUnique.mockResolvedValue(row({ providerId: 'fake-cal', kind: 'CALENDAR' }))
    integration.update.mockResolvedValue(row({ providerId: 'fake-cal', kind: 'CALENDAR' }))
    await service.pollIntegration('int-1')

    expect(integrationEvent.deleteMany).toHaveBeenCalledWith({ where: { integrationId: 'int-1' } })
    const created = integrationEvent.createMany.mock.calls[0][0].data
    expect(created).toEqual([
      {
        integrationId: 'int-1',
        externalId: 'm:1',
        title: 'Due',
        startTime: new Date('2026-08-01T00:00:00Z'),
        endTime: null,
        allDay: true,
      },
    ])
  })
})
