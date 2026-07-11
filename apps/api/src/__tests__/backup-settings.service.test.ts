import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'

/**
 * Automated-backup settings singleton (spec §10 Phase 8.9). Mirrors the Immich /
 * WiFi config contract: the seal passphrase is encrypted at rest, never returned,
 * and omitting it preserves the stored one; enabling requires a passphrase.
 */

const upsert = vi.fn()
const update = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { backupSettings: { upsert, update } },
}))

const { getBackupSettings, updateBackupSettings, recordBackupRun } =
  await import('../services/backup-settings.service.js')

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'singleton',
    enabled: false,
    frequency: 'DAILY' as const,
    hour: 3,
    weekday: 0,
    retentionCount: 7,
    passphrase: null as string | null,
    lastRunAt: null as Date | null,
    lastStatus: null as 'SUCCESS' | 'FAILURE' | null,
    lastError: null as string | null,
    updatedAt: new Date(),
    ...over,
  }
}

beforeEach(() => {
  upsert.mockReset()
  update.mockReset()
})

describe('getBackupSettings', () => {
  it('exposes only whether a passphrase is stored, never the passphrase', async () => {
    upsert.mockResolvedValue(row({ passphrase: 'ciphertext-blob' }))
    const settings = await getBackupSettings()
    expect(settings.hasPassphrase).toBe(true)
    expect(settings).not.toHaveProperty('passphrase')
  })

  it('computes a next run only when enabled', async () => {
    upsert.mockResolvedValueOnce(row({ enabled: false }))
    expect((await getBackupSettings()).nextRunAt).toBeNull()
    upsert.mockResolvedValueOnce(row({ enabled: true, passphrase: 'blob' }))
    expect((await getBackupSettings()).nextRunAt).not.toBeNull()
  })
})

describe('updateBackupSettings', () => {
  const base = {
    enabled: false,
    frequency: 'DAILY' as const,
    hour: 3,
    weekday: 0,
    retentionCount: 7,
  }

  it('encrypts a supplied passphrase at rest (never stores plaintext)', async () => {
    upsert.mockResolvedValueOnce(row()) // current row (read)
    upsert.mockResolvedValueOnce(row({ passphrase: encryptSecret('longenough') })) // write result
    await updateBackupSettings({ ...base, passphrase: 'longenough' })
    const stored = upsert.mock.calls[1][0].update.passphrase as string
    expect(stored).not.toBe('longenough')
    expect(decryptSecret(stored)).toBe('longenough')
  })

  it('leaves the stored passphrase untouched when none is supplied', async () => {
    upsert.mockResolvedValueOnce(row({ passphrase: encryptSecret('existing') }))
    upsert.mockResolvedValueOnce(row({ passphrase: encryptSecret('existing') }))
    await updateBackupSettings({ ...base, retentionCount: 5 })
    expect(upsert.mock.calls[1][0].update).not.toHaveProperty('passphrase')
    expect(upsert.mock.calls[1][0].update.retentionCount).toBe(5)
  })

  it('refuses to enable without a stored or supplied passphrase', async () => {
    upsert.mockResolvedValueOnce(row({ passphrase: null }))
    await expect(updateBackupSettings({ ...base, enabled: true })).rejects.toMatchObject({
      status: 400,
    })
    expect(upsert).toHaveBeenCalledTimes(1) // never reached the write
  })

  it('allows enabling when a passphrase is already stored', async () => {
    upsert.mockResolvedValueOnce(row({ passphrase: encryptSecret('existing') }))
    upsert.mockResolvedValueOnce(row({ enabled: true, passphrase: encryptSecret('existing') }))
    await expect(updateBackupSettings({ ...base, enabled: true })).resolves.toMatchObject({
      enabled: true,
    })
  })
})

describe('recordBackupRun', () => {
  it('stamps the outcome onto the singleton', async () => {
    update.mockResolvedValue(row())
    await recordBackupRun('FAILURE', 'disk full')
    const data = update.mock.calls[0][0].data
    expect(data.lastStatus).toBe('FAILURE')
    expect(data.lastError).toBe('disk full')
    expect(data.lastRunAt).toBeInstanceOf(Date)
  })
})
