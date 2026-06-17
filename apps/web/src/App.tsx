import { AuthGate } from '@/components/auth-gate'
import { useSetupStatus } from '@/api/queries'
import { useCurrentUser } from '@/api/auth'

function FullscreenLoader() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="font-serif text-2xl text-muted-foreground">Hame</p>
    </main>
  )
}

export function App() {
  const setup = useSetupStatus()
  const me = useCurrentUser()

  // Block on the bootstrap queries so we never flash the wrong screen.
  if (setup.isPending || me.isPending) return <FullscreenLoader />

  return <AuthGate requiresSetup={setup.data?.requiresSetup ?? false} user={me.data ?? null} />
}
