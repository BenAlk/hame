import type { PublicUser } from '@hame/shared'
import { AppNav } from '@/components/app-nav'
import { ActiveShoppingWidget } from '@/components/features/widgets/active-shopping-widget'
import { TodaysMealsWidget } from '@/components/features/widgets/todays-meals-widget'
import { ExpiringSoonWidget } from '@/components/features/widgets/expiring-soon-widget'
import { LowStockWidget } from '@/components/features/widgets/low-stock-widget'
import { TodaysChoresWidget } from '@/components/features/widgets/todays-chores-widget'
import { PetRemindersWidget } from '@/components/features/widgets/pet-reminders-widget'
import { NextBinDayWidget } from '@/components/features/widgets/next-bin-day-widget'
import { useCurrentUser } from '@/api/auth'

function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomePage() {
  const { data: user } = useCurrentUser()
  const current = user as PublicUser | null

  return (
    <main className="container flex min-h-screen flex-col gap-8 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-serif text-4xl font-medium text-ink">
            {greeting()}
            {current ? `, ${current.firstName}` : ''}.
          </p>
          <p className="mt-1 text-muted-foreground">Here&apos;s what&apos;s happening at home.</p>
        </div>
        <AppNav user={current} />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TodaysMealsWidget />
        <ActiveShoppingWidget />
        <TodaysChoresWidget />
        <NextBinDayWidget />
        <PetRemindersWidget />
        <ExpiringSoonWidget />
        <LowStockWidget />
      </div>
    </main>
  )
}
