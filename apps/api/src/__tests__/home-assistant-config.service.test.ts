import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'

const upsert = vi.fn()
const reload = vi.fn()
const getStatus = vi.fn(() => ({ status: 'connected', haVersion: '2026.6.1', lastError: null }))

vi.mock('../lib/prisma.js', () => ({
  prisma: { homeAssistantConfig: { upsert, findUnique: vi.fn(), updateMany: vi.fn() } },
}))
vi.mock('../integrations/home-assistant/client.js', () => ({
  haClient: { reload, getStatus },
}))
vi.mock('../integrations/home-assistant/test-connection.js', () => ({
  testHomeAssistantConnection: vi.fn(),
}))

const { getHomeAssistantConfig, updateHomeAssistantConfig } =
  await import('../services/home-assistant-config.service.js')

function row(over: Record<string, unknown> = {}) {
  return {
    url: 'http://ha.test',
    accessToken: null,
    isActive: false,
    lastConnectedAt: null,
    updatedAt: new Date(),
    ...over,
  }
}

beforeEach(() => {
  upsert.mockReset()
  reload.mockReset()
})

describe('getHomeAssistantConfig', () => {
  it('exposes only whether a token is stored, never the token, and overlays live status', async () => {
    upsert.mockResolvedValue(row({ accessToken: 'ciphertext-blob' }))
    const config = await getHomeAssistantConfig()
    expect(config.hasToken).toBe(true)
    expect(config).not.toHaveProperty('accessToken')
    expect(config.status).toBe('connected')
    expect(config.haVersion).toBe('2026.6.1')
  })

  it('reports hasToken=false when no token is stored', async () => {
    upsert.mockResolvedValue(row({ accessToken: null }))
    expect((await getHomeAssistantConfig()).hasToken).toBe(false)
  })
})

describe('updateHomeAssistantConfig', () => {
  it('encrypts the token at rest (never stores plaintext) and reconnects', async () => {
    // The returned row carries a real ciphertext, as the DB would after the write.
    upsert.mockResolvedValue(row({ accessToken: encryptSecret('plain-token'), isActive: true }))
    await updateHomeAssistantConfig({
      url: 'http://ha.test',
      accessToken: 'plain-token',
      isActive: true,
    })

    const stored = upsert.mock.calls[0][0].update.accessToken as string
    expect(stored).not.toBe('plain-token')
    expect(decryptSecret(stored)).toBe('plain-token')
    // Reconnects with the decrypted settings.
    expect(reload).toHaveBeenCalledWith({ url: 'http://ha.test', token: 'plain-token' })
  })

  it('leaves the stored token untouched when none is supplied', async () => {
    upsert.mockResolvedValue(row({ accessToken: encryptSecret('existing'), isActive: true }))
    await updateHomeAssistantConfig({ url: 'http://ha.test', isActive: true })
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('accessToken')
  })
})
