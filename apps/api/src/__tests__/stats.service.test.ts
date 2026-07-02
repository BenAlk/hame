import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
const listMembers = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { choreInstance: { findMany } },
}))
vi.mock('../services/user.service.js', () => ({ listMembers }))

const { getChoreStats } = await import('../services/stats.service.js')

// A fixed "now" so windows and streaks are deterministic (local time).
const NOW = new Date(2026, 6, 2, 12) // 2 Jul 2026, midday
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)
const due = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

const BEN = { id: 'u1', firstName: 'Ben', colour: '#111111' }
const PARTNER = { id: 'u2', firstName: 'Sam', colour: '#222222' }

beforeEach(() => {
  findMany.mockReset()
  listMembers.mockReset()
  listMembers.mockResolvedValue([BEN, PARTNER])
})

describe('getChoreStats', () => {
  it('aggregates counts, share, on-time and streak per user, most-completed first', async () => {
    findMany.mockResolvedValue([
      { completedById: 'u1', completedAt: day(2026, 7, 2, 9), dueDate: due(2026, 7, 2) }, // on time
      { completedById: 'u1', completedAt: day(2026, 7, 1), dueDate: due(2026, 6, 30) }, // late
      { completedById: 'u1', completedAt: day(2026, 7, 1), dueDate: due(2026, 7, 1) }, // on time
      { completedById: 'u2', completedAt: day(2026, 7, 2), dueDate: due(2026, 7, 5) }, // on time
    ])

    const stats = await getChoreStats(30, NOW)

    expect(stats.windowDays).toBe(30)
    expect(stats.totalCompleted).toBe(4)
    expect(stats.perUser.map((u) => u.user.id)).toEqual(['u1', 'u2']) // Ben leads (3 > 1)

    const ben = stats.perUser[0]
    expect(ben.completed).toBe(3)
    expect(ben.sharePct).toBe(75)
    expect(ben.onTimePct).toBe(67) // 2 of 3
    expect(ben.currentStreak).toBe(2) // 2 Jul + 1 Jul

    const sam = stats.perUser[1]
    expect(sam.completed).toBe(1)
    expect(sam.sharePct).toBe(25)
    expect(sam.onTimePct).toBe(100)
    expect(sam.currentStreak).toBe(1)
  })

  it('excludes completions outside the window from counts (onTime null, share 0)', async () => {
    findMany.mockResolvedValue([
      { completedById: 'u1', completedAt: day(2026, 7, 2), dueDate: due(2026, 7, 2) },
      // 40 days ago — inside the 90-day streak look-back but outside the 30-day window.
      { completedById: 'u2', completedAt: day(2026, 5, 23), dueDate: due(2026, 5, 23) },
    ])

    const stats = await getChoreStats(30, NOW)

    expect(stats.totalCompleted).toBe(1)
    const sam = stats.perUser.find((u) => u.user.id === 'u2')!
    expect(sam.completed).toBe(0)
    expect(sam.sharePct).toBe(0)
    expect(sam.onTimePct).toBeNull()
    expect(sam.currentStreak).toBe(0) // 40 days ago can't reach today
  })

  it('returns zeroed rows when nothing has been completed', async () => {
    findMany.mockResolvedValue([])
    const stats = await getChoreStats(7, NOW)

    expect(stats.totalCompleted).toBe(0)
    expect(stats.perUser).toHaveLength(2)
    for (const row of stats.perUser) {
      expect(row.completed).toBe(0)
      expect(row.sharePct).toBe(0)
      expect(row.onTimePct).toBeNull()
      expect(row.currentStreak).toBe(0)
    }
  })
})
