import { describe, it, expect } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isBackupDue,
  mostRecentScheduledSlot,
  nextScheduledSlot,
  type BackupSchedule,
} from '@hame/shared'
import { pruneBackups } from '../services/backup.service.js'

/**
 * The automated-backup scheduling engine (spec §10 Phase 8.9) — pure, UTC, and
 * DST-free, so a coarse hourly tick can decide when a backup is due (and catch up
 * one missed while the container was down). The same pure/impure split as the
 * recurrence / reminder / chore-stats engines.
 */

const daily = (over: Partial<BackupSchedule> = {}): BackupSchedule => ({
  enabled: true,
  frequency: 'DAILY',
  hour: 3,
  weekday: 0,
  ...over,
})

describe('mostRecentScheduledSlot', () => {
  it('DAILY: today at the hour once it has passed', () => {
    const now = new Date('2026-07-11T05:00:00Z')
    expect(mostRecentScheduledSlot(daily(), now).toISOString()).toBe('2026-07-11T03:00:00.000Z')
  })

  it('DAILY: yesterday at the hour when today has not reached it yet', () => {
    const now = new Date('2026-07-11T02:00:00Z')
    expect(mostRecentScheduledSlot(daily(), now).toISOString()).toBe('2026-07-10T03:00:00.000Z')
  })

  it('WEEKLY: the most recent occurrence of the weekday at the hour, at or before now', () => {
    const now = new Date('2026-07-08T12:00:00Z') // a Wednesday
    const slot = mostRecentScheduledSlot(daily({ frequency: 'WEEKLY', weekday: 0 }), now)
    expect(slot.getUTCDay()).toBe(0) // Sunday
    expect(slot.getUTCHours()).toBe(3)
    expect(slot.getTime()).toBeLessThanOrEqual(now.getTime())
    expect(now.getTime() - slot.getTime()).toBeLessThan(7 * 24 * 60 * 60 * 1000)
  })
})

describe('nextScheduledSlot', () => {
  it('DAILY: one day after the most recent slot', () => {
    const now = new Date('2026-07-11T05:00:00Z')
    expect(nextScheduledSlot(daily(), now).toISOString()).toBe('2026-07-12T03:00:00.000Z')
  })

  it('WEEKLY: seven days after the most recent slot, same weekday', () => {
    const now = new Date('2026-07-08T12:00:00Z')
    const cfg = daily({ frequency: 'WEEKLY', weekday: 0 })
    const next = nextScheduledSlot(cfg, now)
    expect(next.getUTCDay()).toBe(0)
    expect(next.getTime() - mostRecentScheduledSlot(cfg, now).getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    )
  })
})

describe('isBackupDue', () => {
  const now = new Date('2026-07-11T05:00:00Z') // past today's 03:00 slot

  it('is never due when disabled', () => {
    expect(isBackupDue(daily({ enabled: false }), null, now)).toBe(false)
  })

  it('is due when it has never run', () => {
    expect(isBackupDue(daily(), null, now)).toBe(true)
  })

  it('is not due when the last run is after the most recent slot', () => {
    expect(isBackupDue(daily(), new Date('2026-07-11T04:00:00Z'), now)).toBe(false)
  })

  it('catches up: due when the last run predates the most recent slot', () => {
    // Container was down over the 03:00 slot; last ran the day before.
    expect(isBackupDue(daily(), new Date('2026-07-10T03:05:00Z'), now)).toBe(true)
  })

  it('is not due just before the hour when the last run covered the previous slot', () => {
    const before = new Date('2026-07-11T02:00:00Z')
    expect(isBackupDue(daily(), new Date('2026-07-10T03:05:00Z'), before)).toBe(false)
  })
})

describe('pruneBackups', () => {
  const names = [
    'hame-auto-2026-07-01T03-00-00-000Z.json',
    'hame-auto-2026-07-02T03-00-00-000Z.json',
    'hame-auto-2026-07-03T03-00-00-000Z.json',
    'hame-auto-2026-07-04T03-00-00-000Z.json',
  ]

  async function seed(files: string[]): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hame-backup-'))
    for (const f of files) await writeFile(join(dir, f), 'x')
    return dir
  }

  it('keeps the newest N by timestamp and deletes the rest', async () => {
    const dir = await seed(names)
    try {
      const retained = await pruneBackups(dir, 2)
      expect(retained).toBe(2)
      expect((await readdir(dir)).sort()).toEqual([
        'hame-auto-2026-07-03T03-00-00-000Z.json',
        'hame-auto-2026-07-04T03-00-00-000Z.json',
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('never touches non-backup files and reports only backups kept', async () => {
    const dir = await seed([names[0], names[1], 'notes.txt', 'hame-backup-manual.json'])
    try {
      const retained = await pruneBackups(dir, 5)
      expect(retained).toBe(2) // only the two hame-auto-*.json count
      const left = await readdir(dir)
      expect(left).toContain('notes.txt')
      expect(left).toContain('hame-backup-manual.json')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('treats a missing directory as empty', async () => {
    expect(await pruneBackups(join(tmpdir(), 'hame-nope-does-not-exist-xyz'), 7)).toBe(0)
  })
})
