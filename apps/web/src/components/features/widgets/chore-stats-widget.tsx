import { Link } from 'react-router-dom'
import { Flame } from 'lucide-react'
import { WidgetCard } from '@/components/features/widget-card'
import { useChoreStats } from '@/api/stats'

/**
 * Compact "pulling your weight" leaderboard (spec §8.7, §10 Phase 8): each
 * member's share of the last 30 days' chore completions, with their current
 * streak. The full breakdown (window picker, on-time rate) lives on /stats.
 */
export function ChoreStatsWidget() {
  const { data: stats, isPending } = useChoreStats(30)
  const active = stats?.perUser.filter((u) => u.completed > 0) ?? []

  return (
    <WidgetCard
      title="Chore stats"
      action={stats ? <span>30 days</span> : undefined}
      footer={
        <Link to="/stats" className="inline-block text-xs text-accent hover:underline">
          Open stats
        </Link>
      }
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No chores completed in the last 30 days.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {active.map((row) => (
            <li key={row.user.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-pill"
                  style={{ backgroundColor: row.user.colour }}
                />
                <span className="min-w-0 flex-1 truncate text-ink">{row.user.firstName}</span>
                {row.currentStreak > 0 && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 text-xs text-accent"
                    title={`${row.currentStreak}-day streak`}
                  >
                    <Flame className="size-3.5" />
                    {row.currentStreak}
                  </span>
                )}
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {row.completed} · {row.sharePct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-pill bg-accent-soft">
                <div
                  className="h-full rounded-pill"
                  style={{ width: `${row.sharePct}%`, backgroundColor: row.user.colour }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}
