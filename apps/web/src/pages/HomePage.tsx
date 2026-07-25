import type { PublicUser } from '@hame/shared'
import { DashboardGrid } from '@/components/features/dashboard/dashboard-grid'
import { SmartHomeSuggestions } from '@/components/features/widgets/smart-home-suggestions'
import { useCurrentUser } from '@/api/auth'
import { useHaEntities, useHaEntityStream } from '@/api/home-assistant'
import { greetingLine } from '@/lib/greeting'

export function HomePage() {
  const { data: user } = useCurrentUser()
  const current = user as PublicUser | null

  // The dashboard owns the single Home Assistant SSE stream (spec §10 Phase 6.2/6.3),
  // so the weather + smart-home widgets share one connection. Only opens once HA
  // actually exposes entities, so non-HA households never connect.
  const { data: haEntities } = useHaEntities()
  const haActive = Boolean(haEntities && haEntities.length > 0)
  useHaEntityStream(haActive)

  return (
    <main className="container flex min-h-screen flex-col gap-8 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-serif text-3xl font-medium text-ink sm:text-4xl">
            {greetingLine(current)}
          </p>
          <p className="mt-1 text-muted-foreground">Here&apos;s what&apos;s happening at home.</p>
        </div>
      </header>

      {haActive && <SmartHomeSuggestions enabled={haActive} />}
      <DashboardGrid />
    </main>
  )
}
