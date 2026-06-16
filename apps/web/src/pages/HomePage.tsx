import { useHealth, useSetupStatus } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type StatusTone = 'ok' | 'warn' | 'pending'

function StatusDot({ tone }: { tone: StatusTone }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 rounded-pill',
        tone === 'ok' && 'bg-sage',
        tone === 'warn' && 'bg-warning',
        tone === 'pending' && 'bg-muted-foreground',
      )}
    />
  )
}

function StatusRow({ label, tone, value }: { label: string; tone: StatusTone; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2">
        <StatusDot tone={tone} />
        <span>{value}</span>
      </dd>
    </div>
  )
}

export function HomePage() {
  const health = useHealth()
  const setup = useSetupStatus()

  const healthRow: { tone: StatusTone; value: string } = health.isPending
    ? { tone: 'pending', value: 'checking…' }
    : health.isError
      ? { tone: 'warn', value: 'unreachable' }
      : { tone: 'ok', value: health.data.status }

  const setupRow: { tone: StatusTone; value: string } = setup.isPending
    ? { tone: 'pending', value: 'checking…' }
    : setup.isError
      ? { tone: 'warn', value: 'unknown' }
      : setup.data.requiresSetup
        ? { tone: 'warn', value: 'create admin' }
        : { tone: 'ok', value: 'ready' }

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-8 py-12">
      <div className="text-center">
        <h1 className="font-serif text-5xl font-medium tracking-tight text-ink">Hame</h1>
        <p className="mt-2 text-muted-foreground">Your household, all in one place.</p>
      </div>

      <div className="w-full max-w-md rounded-card border border-line bg-card p-6">
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Stack status
        </h2>
        <dl className="space-y-3 text-sm">
          <StatusRow label="API health" tone={healthRow.tone} value={healthRow.value} />
          <StatusRow label="Requires setup" tone={setupRow.tone} value={setupRow.value} />
        </dl>
        <Button className="mt-6 w-full" onClick={() => health.refetch()}>
          Refresh
        </Button>
      </div>
    </main>
  )
}
