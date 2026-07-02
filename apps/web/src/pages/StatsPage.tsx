import { useState } from 'react'
import { Flame } from 'lucide-react'
import { STATS_WINDOWS, type StatsWindow } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { cn } from '@/lib/utils'
import { useChoreStats } from '@/api/stats'

const WINDOW_LABELS: Record<StatsWindow, string> = {
  7: 'Last 7 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
}

/**
 * The "pulling your weight" chore-stats page (spec §8.7, §9.4, §10 Phase 8):
 * a per-member breakdown — completions, household share, on-time rate and current
 * streak — over a selectable window, derived live from completion history.
 */
export function StatsPage() {
  const [days, setDays] = useState<StatsWindow>(30)
  const { data: stats, isPending } = useChoreStats(days)

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Stats</h1>
        <div className="flex gap-1 rounded-pill border border-line bg-surface p-1">
          {STATS_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={cn(
                'rounded-pill px-3 py-1 text-sm transition-colors',
                days === w ? 'bg-accent text-white' : 'text-muted-foreground hover:text-ink',
              )}
            >
              {w}d
            </button>
          ))}
        </div>
      </header>

      <WidgetCard title="Pulling your weight" action={<span>{WINDOW_LABELS[days]}</span>}>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !stats || stats.perUser.length === 0 ? (
          <p className="text-sm text-muted-foreground">No household members yet.</p>
        ) : stats.totalCompleted === 0 ? (
          <p className="text-sm text-muted-foreground">
            No chores completed in this window. Once chores get ticked off, who did what shows up
            here.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {stats.perUser.map((row) => (
              <li key={row.user.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="inline-block size-3 shrink-0 self-center rounded-pill"
                    style={{ backgroundColor: row.user.colour }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {row.user.firstName}
                  </span>
                  {row.currentStreak > 0 && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 text-sm text-accent"
                      title={`${row.currentStreak}-day streak`}
                    >
                      <Flame className="size-4" />
                      {row.currentStreak}-day
                    </span>
                  )}
                </div>
                <div className="h-2 overflow-hidden rounded-pill bg-accent-soft">
                  <div
                    className="h-full rounded-pill"
                    style={{ width: `${row.sharePct}%`, backgroundColor: row.user.colour }}
                  />
                </div>
                <div className="flex flex-wrap gap-x-4 text-xs tabular-nums text-muted-foreground">
                  <span>
                    <strong className="text-ink">{row.completed}</strong> completed
                  </span>
                  <span>
                    <strong className="text-ink">{row.sharePct}%</strong> share
                  </span>
                  <span>
                    {row.onTimePct === null ? (
                      '—'
                    ) : (
                      <>
                        <strong className="text-ink">{row.onTimePct}%</strong> on time
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WidgetCard>

      <p className="text-xs text-muted-foreground">
        Figures come straight from completed chores over the window — no scores are stored.
      </p>
    </main>
  )
}
