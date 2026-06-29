import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'

const upsert = vi.fn()
const findUnique = vi.fn()
const updateMany = vi.fn()
const fetchAssetIds = vi.fn()
const buildAssetPool = vi.fn((ids: string[]) => ids)

vi.mock('../lib/prisma.js', () => ({
  prisma: { immichConfig: { upsert, findUnique, updateMany } },
}))
vi.mock('../integrations/immich/index.js', () => ({
  fetchAlbums: vi.fn(),
  fetchAssetIds: (...args: unknown[]) => fetchAssetIds(...args),
  fetchAssetPreview: vi.fn(),
  testImmichConnection: vi.fn(),
  buildAssetPool: (...args: unknown[]) => buildAssetPool(...(args as [string[]])),
}))

const { getImmichConfig, updateImmichConfig, getIdleAssetIds } =
  await import('../services/immich-config.service.js')

function row(over: Record<string, unknown> = {}) {
  return {
    url: 'http://immich.test',
    apiKey: null,
    selectedAlbumIds: [],
    isActive: false,
    lastConnectedAt: null,
    updatedAt: new Date(),
    ...over,
  }
}

beforeEach(() => {
  upsert.mockReset()
  findUnique.mockReset()
  fetchAssetIds.mockReset()
  buildAssetPool.mockClear()
})

describe('getImmichConfig', () => {
  it('exposes only whether a key is stored, never the key itself', async () => {
    upsert.mockResolvedValue(row({ apiKey: 'ciphertext-blob', isActive: true }))
    const config = await getImmichConfig()
    expect(config.hasApiKey).toBe(true)
    expect(config).not.toHaveProperty('apiKey')
    expect(config.configured).toBe(true)
  })

  it('configured is false until active with a url and key', async () => {
    upsert.mockResolvedValue(row({ apiKey: 'blob', isActive: false }))
    expect((await getImmichConfig()).configured).toBe(false)
  })
})

describe('updateImmichConfig', () => {
  it('encrypts the key at rest (never stores plaintext)', async () => {
    upsert.mockResolvedValue(row({ apiKey: encryptSecret('plain-key'), isActive: true }))
    await updateImmichConfig({ url: 'http://immich.test', apiKey: 'plain-key', isActive: true })
    const stored = upsert.mock.calls[0][0].update.apiKey as string
    expect(stored).not.toBe('plain-key')
    expect(decryptSecret(stored)).toBe('plain-key')
  })

  it('leaves the stored key untouched when none is supplied', async () => {
    upsert.mockResolvedValue(row({ apiKey: encryptSecret('existing') }))
    await updateImmichConfig({ url: 'http://immich.test', selectedAlbumIds: ['x'] })
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('apiKey')
    expect(upsert.mock.calls[0][0].update.selectedAlbumIds).toEqual(['x'])
  })
})

describe('getIdleAssetIds', () => {
  it('returns an empty pool when Immich is not configured (clock-only fallback)', async () => {
    findUnique.mockResolvedValue(row({ apiKey: null, isActive: false }))
    expect(await getIdleAssetIds(true)).toEqual([])
    expect(fetchAssetIds).not.toHaveBeenCalled()
  })

  it('builds a pool from the configured selection when active', async () => {
    findUnique.mockResolvedValue(
      row({ apiKey: encryptSecret('k'), isActive: true, selectedAlbumIds: ['alb'] }),
    )
    fetchAssetIds.mockResolvedValue(['p1', 'p2'])
    const pool = await getIdleAssetIds(false)
    expect(pool).toEqual(['p1', 'p2'])
    // The decrypted key reaches the client, and the configured albums are used.
    expect(fetchAssetIds).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://immich.test', apiKey: 'k' }),
      ['alb'],
    )
  })

  it('degrades to an empty pool if listing assets throws', async () => {
    findUnique.mockResolvedValue(row({ apiKey: encryptSecret('k'), isActive: true }))
    fetchAssetIds.mockRejectedValue(new Error('unreachable'))
    expect(await getIdleAssetIds(true)).toEqual([])
  })
})
