import { Link } from 'react-router-dom'
import type { PublicUser } from '@hame/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { useCurrentUser, useLogout } from '@/api/auth'

function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomePage() {
  const { data: user } = useCurrentUser()
  const logout = useLogout()

  // The auth gate guarantees a user here, but guard for the loading frame.
  const current = user as PublicUser | null

  return (
    <main className="container flex min-h-screen flex-col gap-8 py-10">
      <header className="flex items-start justify-between">
        <div>
          <p className="font-serif text-4xl font-medium text-ink">
            {greeting()}
            {current ? `, ${current.firstName}` : ''}.
          </p>
          <p className="mt-1 text-muted-foreground">Welcome to your household.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/profile" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Profile
          </Link>
          {current?.role === 'ADMIN' && (
            <Link to="/admin/users" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Users
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Log out
          </Button>
        </div>
      </header>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Widgets land here in Phase 2. For now, you&apos;re logged in — the foundations are
            ready.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
