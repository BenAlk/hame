import type { IntegrationMetricState } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { useIntegrationStatus } from '@/api/integrations'
import { cn } from '@/lib/utils'

const METRIC_STATE_CLASS: Record<IntegrationMetricState, string> = {
  ok: 'text-sage',
  warn: 'text-warning',
  crit: 'text-warning',
  unknown: 'text-ink',
}

/**
 * Generic status dashboard widget (spec §10 Phase 10.2). Renders the normalised
 * metric snapshot of every active STATUS integration (TrueNAS today) uniformly —
 * no bespoke component per provider, which is what keeps the framework a framework.
 */
export function IntegrationStatusWidget() {
  const { data: statuses, isPending } = useIntegrationStatus()

  return (
    <WidgetCard title="System status">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !statuses || statuses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No status integrations.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {statuses.map((status) => (
            <div key={status.id} className="flex flex-col gap-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {status.name}
              </p>
              {status.lastError ? (
                <p className="text-sm text-warning">{status.lastError}</p>
              ) : status.snapshot && status.snapshot.metrics.length > 0 ? (
                <dl className="flex flex-col gap-1">
                  {status.snapshot.metrics.map((m) => (
                    <div key={m.label} className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-sm text-muted-foreground">{m.label}</dt>
                      <dd
                        className={cn(
                          'truncate text-right text-sm font-medium',
                          METRIC_STATE_CLASS[m.state],
                        )}
                      >
                        {m.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Waiting for first reading…</p>
              )}
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}
