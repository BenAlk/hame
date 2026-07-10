import { useState } from 'react'
import { CheckCircle2, Pause, PlugZap, Play, Plus, RefreshCw, XCircle } from 'lucide-react'
import type {
  Integration,
  IntegrationFieldSpec,
  IntegrationMetricState,
  IntegrationProviderInfo,
  IntegrationTestResult,
} from '@hame/shared'
import { DEFAULT_INTEGRATION_POLL_SECONDS } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { ApiError } from '@/api/client'
import { toast } from '@/stores/toast'
import {
  useCreateIntegration,
  useDeleteIntegration,
  useIntegrationProviders,
  useIntegrations,
  useSyncIntegration,
  useTestIntegration,
  useUpdateIntegration,
} from '@/api/integrations'

const METRIC_STATE_CLASS: Record<IntegrationMetricState, string> = {
  ok: 'text-sage',
  warn: 'text-warning',
  crit: 'text-warning',
  unknown: 'text-muted-foreground',
}

/**
 * Admin-only integrations (spec §9.9, §10 Phase 10). Lists configured integrations
 * and drives an add/edit form generically from each provider's declared fields, so
 * a new provider needs no bespoke UI here.
 */
export function IntegrationsCard() {
  const { data: providers } = useIntegrationProviders()
  const { data: integrations } = useIntegrations()
  const [adding, setAdding] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Pull data from your other self-hosted services onto Hame&apos;s dashboard and calendar.
          Each integration is admin-configured; any secret is encrypted at rest and never leaves the
          server.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {integrations && integrations.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No integrations yet.</p>
        )}

        {integrations?.map((integration) => (
          <IntegrationRow
            key={integration.id}
            integration={integration}
            provider={providers?.find((p) => p.id === integration.providerId)}
          />
        ))}

        {adding ? (
          <IntegrationForm providers={providers ?? []} onDone={() => setAdding(false)} />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setAdding(true)}
            disabled={!providers || providers.length === 0}
          >
            <Plus className="size-4" />
            Add integration
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** One configured integration: its state, cached data, and edit/sync/remove actions. */
function IntegrationRow({
  integration,
  provider,
}: {
  integration: Integration
  provider?: IntegrationProviderInfo
}) {
  const [editing, setEditing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const sync = useSyncIntegration()
  const remove = useDeleteIntegration()
  const update = useUpdateIntegration()

  if (editing && provider) {
    return (
      <div className="rounded-card border border-line p-4">
        <IntegrationForm
          providers={[provider]}
          integration={integration}
          onDone={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">{integration.name}</span>
        <span className="inline-flex items-center rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {integration.kind === 'CALENDAR' ? 'Calendar' : 'Status'}
        </span>
        {!integration.isActive && (
          <span className="inline-flex items-center rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Paused
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {provider?.name ?? integration.providerId}
        </span>
      </div>

      {integration.kind === 'STATUS' && integration.snapshot && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {integration.snapshot.metrics.map((m) => (
            <div key={m.label} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{m.label}</dt>
              <dd className={cn('text-sm font-medium', METRIC_STATE_CLASS[m.state])}>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {integration.kind === 'CALENDAR' && (
        <p className="text-xs text-muted-foreground">Its dated events appear on the calendar.</p>
      )}

      {integration.lastError ? (
        <p className="flex items-start gap-2 text-xs text-warning">
          <XCircle className="mt-0.5 size-3.5 shrink-0" />
          {integration.lastError}
        </p>
      ) : (
        integration.lastSyncedAt && (
          <p className="text-xs text-muted-foreground">
            Last synced {new Date(integration.lastSyncedAt).toLocaleString()}
          </p>
        )
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => sync.mutate(integration.id)}
          disabled={sync.isPending || !integration.isActive}
        >
          <RefreshCw className={cn('size-4', sync.isPending && 'animate-spin')} />
          {sync.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            update.mutate({ id: integration.id, body: { isActive: !integration.isActive } })
          }
          disabled={update.isPending}
        >
          {integration.isActive ? (
            <>
              <Pause className="size-4" />
              Pause
            </>
          ) : (
            <>
              <Play className="size-4" />
              Resume
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          disabled={!provider}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-warning"
          onClick={() => setConfirmOpen(true)}
        >
          Remove
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Remove ${integration.name}?`}
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(integration.id)
            setConfirmOpen(false)
            toast.success('Integration removed.')
          } catch (err) {
            setConfirmOpen(false)
            toast.error(err instanceof ApiError ? err.message : 'Could not remove it.')
          }
        }}
        onCancel={() => setConfirmOpen(false)}
      >
        This removes the integration and its cached data. It can be added again later.
      </ConfirmDialog>
    </div>
  )
}

/** Provider-driven add/edit form. The single secret field maps to the row's secret. */
function IntegrationForm({
  providers,
  integration,
  onDone,
}: {
  providers: IntegrationProviderInfo[]
  integration?: Integration
  onDone: () => void
}) {
  const isEdit = Boolean(integration)
  const create = useCreateIntegration()
  const update = useUpdateIntegration()
  const test = useTestIntegration()

  const [providerId, setProviderId] = useState(integration?.providerId ?? providers[0]?.id ?? '')
  const provider = providers.find((p) => p.id === providerId)

  const [name, setName] = useState(integration?.name ?? '')
  const [config, setConfig] = useState<Record<string, string>>(() => seedConfig(integration))
  const [secret, setSecret] = useState('')
  const [pollMinutes, setPollMinutes] = useState(
    Math.round((integration?.pollIntervalSeconds ?? DEFAULT_INTEGRATION_POLL_SECONDS) / 60),
  )
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<IntegrationTestResult | null>(null)

  const secretField = provider?.secretFields[0]

  function setConfigValue(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setResult(null)
  }

  /** The typed config, coercing number fields; used for both test and save. */
  function buildConfig(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const field of provider?.configFields ?? []) {
      const raw = config[field.key]?.trim() ?? ''
      out[field.key] = field.type === 'number' ? Number(raw) : raw
    }
    return out
  }

  async function handleTest() {
    if (!provider) return
    setError(null)
    setResult(null)
    try {
      setResult(
        await test.mutateAsync({
          providerId: provider.id,
          config: buildConfig(),
          secret: secret.trim() || undefined,
        }),
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not test the connection.')
    }
  }

  async function handleSave() {
    if (!provider) return
    setError(null)
    const trimmedSecret = secret.trim()
    try {
      if (isEdit && integration) {
        await update.mutateAsync({
          id: integration.id,
          body: {
            name: name.trim(),
            config: buildConfig(),
            ...(trimmedSecret && { secret: trimmedSecret }),
            pollIntervalSeconds: pollMinutes * 60,
          },
        })
      } else {
        await create.mutateAsync({
          providerId: provider.id,
          name: name.trim(),
          config: buildConfig(),
          ...(trimmedSecret && { secret: trimmedSecret }),
          pollIntervalSeconds: pollMinutes * 60,
        })
      }
      toast.success(isEdit ? 'Integration updated.' : 'Integration added.')
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the integration.')
    }
  }

  const pending = create.isPending || update.isPending

  return (
    <div className="flex flex-col gap-4">
      {!isEdit && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="integration-provider">Service</Label>
          <select
            id="integration-provider"
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value)
              setConfig({})
              setResult(null)
            }}
            className="rounded-control border border-input bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {provider && <p className="text-xs text-muted-foreground">{provider.description}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="integration-name">Name</Label>
        <Input
          id="integration-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={provider?.name ?? 'Integration'}
        />
      </div>

      {provider?.configFields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={config[field.key] ?? ''}
          onChange={(v) => setConfigValue(field.key, v)}
        />
      ))}

      {secretField && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`integration-${secretField.key}`}>{secretField.label}</Label>
          <Input
            id={`integration-${secretField.key}`}
            type="password"
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value)
              setResult(null)
            }}
            placeholder={
              integration?.hasSecret ? 'Set — leave blank to keep' : (secretField.placeholder ?? '')
            }
            autoComplete="off"
          />
          {secretField.help && <p className="text-xs text-muted-foreground">{secretField.help}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="integration-poll">Refresh every (minutes)</Label>
        <Input
          id="integration-poll"
          type="number"
          min={1}
          value={pollMinutes}
          onChange={(e) => setPollMinutes(Math.max(1, Number(e.target.value) || 0))}
          className="w-32"
        />
      </div>

      {error && <p className="text-sm text-warning">{error}</p>}
      {result && (
        <p
          className={cn('flex items-start gap-2 text-sm', result.ok ? 'text-sage' : 'text-warning')}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          )}
          {result.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void handleSave()} disabled={pending || !name.trim()}>
          {pending ? 'Saving…' : isEdit ? 'Save' : 'Add'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleTest()}
          disabled={test.isPending || !provider}
        >
          <PlugZap className="size-4" />
          {test.isPending ? 'Testing…' : 'Test connection'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: IntegrationFieldSpec
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`integration-${field.key}`}>{field.label}</Label>
      <Input
        id={`integration-${field.key}`}
        type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? ''}
        autoComplete="off"
      />
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
    </div>
  )
}

/** Seed the config form from an integration's stored config (values → strings). */
function seedConfig(integration?: Integration): Record<string, string> {
  if (!integration) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(integration.config)) {
    out[key] = value == null ? '' : String(value)
  }
  return out
}
