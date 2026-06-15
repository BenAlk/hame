import { useHealth, useSetupStatus } from '@/api/queries'
import { Button } from '@/components/ui/button'

export function HomePage() {
  const health = useHealth()
  const setup = useSetupStatus()

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-12">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-primary">Hame</h1>
        <p className="mt-2 text-muted-foreground">Your household, all in one place.</p>
      </div>

      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Stack status</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">API health</dt>
            <dd>
              {health.isPending
                ? 'checking…'
                : health.isError
                  ? '❌ unreachable'
                  : `✅ ${health.data.status}`}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Requires setup</dt>
            <dd>
              {setup.isPending
                ? 'checking…'
                : setup.isError
                  ? '❌ unknown'
                  : setup.data.requiresSetup
                    ? 'yes — create admin'
                    : 'no'}
            </dd>
          </div>
        </dl>
        <Button className="mt-6 w-full" onClick={() => health.refetch()}>
          Refresh
        </Button>
      </div>
    </main>
  )
}
