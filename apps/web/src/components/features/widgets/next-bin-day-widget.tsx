import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { format } from 'date-fns'
import type { BinCollection } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { useBins } from '@/api/bins'
import { relativeDay } from '@/lib/format'

type ScheduledBin = BinCollection & { nextCollection: string | Date }

/** Local calendar-day key — `nextCollection` is a local-midnight date. */
function dayKey(date: string | Date): string {
  return format(new Date(date), 'yyyy-MM-dd')
}

/** "Next bin day" countdown with colour-coded bins (spec §8.9, §8.12). */
export function NextBinDayWidget() {
  const { data: bins, isPending } = useBins()

  // Active bins with an upcoming collection, soonest first.
  const upcoming = useMemo(
    () =>
      (bins ?? [])
        .filter((b): b is ScheduledBin => Boolean(b.isActive && b.nextCollection))
        .sort(
          (a, b) => new Date(a.nextCollection).getTime() - new Date(b.nextCollection).getTime(),
        ),
    [bins],
  )

  // Every bin collected on the soonest day, shown together.
  const next = upcoming[0]
  const sameDay = next
    ? upcoming.filter((b) => dayKey(b.nextCollection) === dayKey(next.nextCollection))
    : []

  return (
    <WidgetCard
      title="Next bin day"
      footer={
        <Link to="/bins" className="inline-block text-xs text-accent hover:underline">
          Open bins
        </Link>
      }
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !next ? (
        <p className="text-sm text-muted-foreground">No bin schedule set.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-serif text-2xl text-ink">{relativeDay(next.nextCollection)}</p>
            <p className="text-sm text-muted-foreground">
              {format(new Date(next.nextCollection), 'EEEE d MMMM')}
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {sameDay.map((bin) => (
              <li key={bin.id} className="flex items-center gap-2 text-sm text-ink">
                <span
                  className="size-3.5 shrink-0 rounded"
                  style={{ backgroundColor: bin.colour }}
                  aria-hidden
                />
                {bin.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  )
}
