import type { ChoreStats, UserChoreStats } from '@hame/shared'
import { computeStreak, isOnTime } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { listMembers } from './user.service.js'

/**
 * Chore "pulling your weight" stats (spec §8.7, §9.4, §10 Phase 8), derived live
 * from `ChoreInstance` completion history — no stored stats and no new model
 * (§9.4: the instance pattern already carries who-completed-what-when). The heavy
 * lifting (streak, on-time) lives in the pure `@hame/shared` helpers; this service
 * only queries and aggregates.
 */

/**
 * How far back to read completions for the streak, independent of the display
 * window — a streak can be longer than the selected window (but a chore streak
 * beyond a quarter is unrealistic, so this also bounds the query).
 */
const STREAK_LOOKBACK_DAYS = 90

/** Local-time start of the calendar day `date` falls in. */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Local-time start-of-day `days` before `now` (0 = today). */
function daysAgo(now: Date, days: number): Date {
  const d = startOfDay(now)
  d.setDate(d.getDate() - days)
  return d
}

/**
 * Assemble household chore stats over the last `windowDays`. One query reads every
 * completion in the wider of the window and the streak look-back, then the counts
 * and on-time rate use the window subset while the streak uses the full tail.
 */
export async function getChoreStats(
  windowDays: number,
  now: Date = new Date(),
): Promise<ChoreStats> {
  // Inclusive window: `windowDays - 1` days ago through today.
  const windowStart = daysAgo(now, windowDays - 1)
  const lookbackStart = daysAgo(now, Math.max(windowDays, STREAK_LOOKBACK_DAYS) - 1)

  const [members, completions] = await Promise.all([
    listMembers(),
    prisma.choreInstance.findMany({
      where: { completedAt: { gte: lookbackStart }, completedById: { not: null } },
      select: { completedById: true, completedAt: true, dueDate: true },
    }),
  ])

  // `completedAt`/`completedById` are non-null here (filtered above); narrow once.
  // Keep only completions by actual people — a chore ticked at the wall tablet is
  // attributed to the tablet account, which isn't on the leaderboard, so it must
  // not inflate the household total (the share-% denominator) either.
  const memberIds = new Set(members.map((m) => m.id))
  const rows = completions
    .map((c) => ({
      userId: c.completedById as string,
      completedAt: c.completedAt as Date,
      dueDate: c.dueDate,
    }))
    .filter((r) => memberIds.has(r.userId))
  const inWindow = rows.filter((r) => r.completedAt >= windowStart)
  const totalCompleted = inWindow.length

  const perUser: UserChoreStats[] = members.map((user) => {
    const mineWindow = inWindow.filter((r) => r.userId === user.id)
    const completed = mineWindow.length
    const onTimeCount = mineWindow.filter((r) => isOnTime(r.completedAt, r.dueDate)).length
    const myCompletionDates = rows.filter((r) => r.userId === user.id).map((r) => r.completedAt)

    return {
      user,
      completed,
      sharePct: totalCompleted === 0 ? 0 : Math.round((completed / totalCompleted) * 100),
      onTimePct: completed === 0 ? null : Math.round((onTimeCount / completed) * 100),
      currentStreak: computeStreak(myCompletionDates, now),
    }
  })

  // Most-completed first; ties keep the roster (creation-date) order.
  perUser.sort((a, b) => b.completed - a.completed)

  return { windowDays, totalCompleted, perUser }
}
