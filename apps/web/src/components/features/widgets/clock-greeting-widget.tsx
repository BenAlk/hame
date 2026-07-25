import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import type { PublicUser } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { useCurrentUser } from '@/api/auth'
import { greetingLine } from '@/lib/greeting'

/** A live clock with a time-of-day greeting (spec §8.12) — the wall tablet's
 *  anchor tile. Ticks once a minute (no seconds shown, so no need for more). */
export function ClockGreetingWidget() {
  const { data: user } = useCurrentUser()
  const current = user as PublicUser | null
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Align the first tick to the next minute boundary, then tick every minute.
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(
      () => {
        setNow(new Date())
        interval = setInterval(() => setNow(new Date()), 60_000)
      },
      (60 - new Date().getSeconds()) * 1000,
    )
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  return (
    <WidgetCard title="Today">
      <div className="flex flex-col gap-1">
        <p className="font-serif text-5xl leading-none text-ink">{format(now, 'HH:mm')}</p>
        <p className="text-sm text-muted-foreground">{format(now, 'EEEE d MMMM')}</p>
        <p className="mt-2 text-sm text-ink">{greetingLine(current, now)}</p>
      </div>
    </WidgetCard>
  )
}
