import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { format, startOfDay } from 'date-fns'
import { WidgetCard } from '@/components/features/widget-card'
import { useCalendar } from '@/api/calendar'
import { relativeDay } from '@/lib/format'

const HORIZON_DAYS = 14
const MAX_EVENTS = 6

/** The next handful of events across the aggregated calendar (spec §8.10, §8.12). */
export function UpcomingEventsWidget() {
  const { start, end } = useMemo(() => {
    const from = startOfDay(new Date())
    const to = new Date(from)
    to.setDate(to.getDate() + HORIZON_DAYS)
    return { start: format(from, 'yyyy-MM-dd'), end: format(to, 'yyyy-MM-dd') }
  }, [])

  const { data: events, isPending } = useCalendar(start, end)

  const upcoming = useMemo(() => {
    const now = Date.now()
    return (events ?? [])
      .filter((e) => {
        // Keep today's all-day events and anything still ahead of now.
        const t = new Date(e.startTime).getTime()
        return e.allDay ? t >= startOfDay(new Date()).getTime() : t >= now
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, MAX_EVENTS)
  }, [events])

  return (
    <WidgetCard title="Upcoming events">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in the next fortnight.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((event) => (
            <li key={event.id} className="flex items-baseline gap-2.5 text-sm">
              <span
                className="mt-1 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: event.colour ?? 'var(--accent)' }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-ink">{event.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {relativeDay(event.startTime)}
                {event.allDay ? '' : ` · ${format(new Date(event.startTime), 'HH:mm')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/calendar" className="mt-3 inline-block text-xs text-accent hover:underline">
        Open calendar
      </Link>
    </WidgetCard>
  )
}
