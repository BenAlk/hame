import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  BACKUP_MODELS,
  BACKUP_JOIN_TABLES,
  BACKUP_FORMAT_VERSION,
  type BackupPayload,
} from '@hame/shared'
import { sealBackup, openBackup } from '../lib/backup-crypto.js'
import { HttpError } from '../lib/http-error.js'

/**
 * Coverage guard (spec §9.8): the backup's explicit table lists must track the
 * schema, so adding a model or an implicit m2m relation without adding it here
 * fails this test rather than silently dropping a table from every backup.
 */
describe('backup table coverage', () => {
  it('BACKUP_MODELS covers every Prisma model exactly once', () => {
    const modelNames = Prisma.dmmf.datamodel.models.map((m) => m.name)
    expect(new Set(BACKUP_MODELS)).toEqual(new Set(modelNames))
    expect(BACKUP_MODELS.length).toBe(modelNames.length) // no duplicates
  })

  it('BACKUP_JOIN_TABLES covers every implicit many-to-many join table', () => {
    // A relation is an implicit m2m when both of its endpoints are list fields
    // with no scalar foreign key; Prisma names its join table `_<relationName>`.
    const endpoints = new Map<string, boolean[]>()
    for (const model of Prisma.dmmf.datamodel.models) {
      for (const field of model.fields) {
        if (field.kind === 'object' && field.relationName) {
          const list = endpoints.get(field.relationName) ?? []
          list.push(field.isList)
          endpoints.set(field.relationName, list)
        }
      }
    }
    const joinTables = [...endpoints.entries()]
      .filter(([, ends]) => ends.length === 2 && ends.every(Boolean))
      .map(([name]) => `_${name}`)
    expect(new Set(joinTables)).toEqual(new Set(BACKUP_JOIN_TABLES))
  })
})

describe('backup crypto', () => {
  it('round-trips a payload through seal and open', async () => {
    const plaintext = JSON.stringify({ hello: 'world', n: 42 })
    const envelope = await sealBackup(plaintext, 'correct horse battery')
    expect(envelope.hameBackup).toBe(BACKUP_FORMAT_VERSION)
    expect(envelope.ciphertext).not.toContain('hello') // actually encrypted
    expect(await openBackup(envelope, 'correct horse battery')).toBe(plaintext)
  })

  it('rejects a wrong passphrase with a 400', async () => {
    const envelope = await sealBackup('secret', 'right')
    await expect(openBackup(envelope, 'wrong')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('passphrase'),
    })
  })

  it('rejects a tampered ciphertext', async () => {
    const envelope = await sealBackup('secret', 'pass')
    const flipped = Buffer.from(envelope.ciphertext, 'base64')
    flipped[0] ^= 0xff
    const tampered = { ...envelope, ciphertext: flipped.toString('base64') }
    await expect(openBackup(tampered, 'pass')).rejects.toBeInstanceOf(HttpError)
  })
})

// ---- import guards (mocked DB) ----

const queryRawUnsafe = vi.fn()
const executeRawUnsafe = vi.fn()
const transaction = vi.fn()
const reloadHomeAssistant = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => queryRawUnsafe(...args),
    $executeRawUnsafe: (...args: unknown[]) => executeRawUnsafe(...args),
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}))
vi.mock('../integrations/home-assistant/index.js', () => ({
  reloadHomeAssistant: () => reloadHomeAssistant(),
}))

const { importBackup } = await import('../services/backup.service.js')

function emptyTables(): Record<string, unknown[]> {
  return Object.fromEntries(BACKUP_MODELS.map((m) => [m, []]))
}
function emptyJoinTables(): Record<string, unknown[]> {
  return Object.fromEntries(BACKUP_JOIN_TABLES.map((t) => [t, []]))
}
function payload(over: Partial<BackupPayload['manifest']> = {}): BackupPayload {
  return {
    manifest: {
      formatVersion: BACKUP_FORMAT_VERSION,
      app: 'hame',
      migration: 'current_migration',
      createdAt: new Date().toISOString(),
      counts: Object.fromEntries(BACKUP_MODELS.map((m) => [m, 0])),
      ...over,
    },
    tables: emptyTables() as BackupPayload['tables'],
    joinTables: emptyJoinTables() as BackupPayload['joinTables'],
  }
}
async function seal(
  p: BackupPayload,
  pass = 'pass1234',
): Promise<[Awaited<ReturnType<typeof sealBackup>>, string]> {
  return [await sealBackup(JSON.stringify(p), pass), pass]
}

beforeEach(() => {
  queryRawUnsafe.mockReset()
  executeRawUnsafe.mockReset()
  transaction.mockReset()
  reloadHomeAssistant.mockReset()
  // currentMigration → the instance's applied migration
  queryRawUnsafe.mockResolvedValue([{ migration_name: 'current_migration' }])
})

describe('importBackup guards', () => {
  it('refuses a backup taken at a different migration (version gate)', async () => {
    const [envelope, pass] = await seal(payload({ migration: 'older_migration' }))
    await expect(importBackup(pass, envelope)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('different app version'),
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('refuses a wrong passphrase before touching the database', async () => {
    const [envelope] = await seal(payload())
    await expect(importBackup('not-the-pass', envelope)).rejects.toMatchObject({ status: 400 })
    expect(queryRawUnsafe).not.toHaveBeenCalled()
  })

  it('refuses a file that fails its integrity check', async () => {
    const p = payload()
    p.manifest.counts.User = 3 // manifest claims 3 users, tables has 0
    const [envelope, pass] = await seal(p)
    await expect(importBackup(pass, envelope)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('integrity'),
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('wipes, reloads and reconnects on a valid restore', async () => {
    const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(undefined) }
    transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
    const [envelope, pass] = await seal(payload())

    const result = await importBackup(pass, envelope)

    expect(result.totalRows).toBe(0)
    // One TRUNCATE of every table; empty tables insert nothing.
    const truncate = tx.$executeRawUnsafe.mock.calls.find((c) => String(c[0]).includes('TRUNCATE'))
    expect(truncate).toBeDefined()
    expect(reloadHomeAssistant).toHaveBeenCalledOnce()
  })
})
