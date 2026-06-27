import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type {
  HaConnectionStatus,
  HomeAssistantTestResult,
  NormaliserStrategy,
  OllamaTestResult,
} from '@hame/shared'
import { DEFAULT_OLLAMA_MODEL } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ApiError } from '@/api/client'
import { useHouseholdSettings, useUpdateHouseholdSettings } from '@/api/household-settings'
import { useOllamaConfig, useProbeOllamaModels, useUpdateOllamaConfig } from '@/api/ollama-config'
import {
  useHomeAssistantConfig,
  useTestHomeAssistant,
  useUpdateHomeAssistantConfig,
} from '@/api/home-assistant'

const STRATEGIES: { value: NormaliserStrategy; label: string; description: string }[] = [
  {
    value: 'BASIC',
    label: 'Basic',
    description: 'Regex parser only. Zero setup — the reliable default.',
  },
  {
    value: 'DICTIONARY',
    label: 'Dictionary',
    description: 'Adds a bundled lookup of common ingredients for cleaner names and units.',
  },
  {
    value: 'LLM',
    label: 'Language model',
    description: 'Adds a self-hosted Ollama pass over the dictionary. Falls back if unreachable.',
  },
]

/** Admin-only household settings: ingredient normalisation + Ollama (spec §10 Phase 4.5). */
export function SettingsPage() {
  const { data: settings } = useHouseholdSettings()
  const updateSettings = useUpdateHouseholdSettings()

  const strategy = settings?.ingredientNormaliser ?? 'BASIC'
  const caldavEnabled = settings?.caldavEnabled ?? false

  function chooseStrategy(value: NormaliserStrategy) {
    if (value !== strategy) updateSettings.mutate({ ingredientNormaliser: value })
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <h1 className="font-serif text-3xl font-medium text-ink">Settings</h1>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingredient normalisation</CardTitle>
            <CardDescription>
              How recipe ingredients are cleaned into shopping-list items on import.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {STRATEGIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => chooseStrategy(s.value)}
                aria-pressed={strategy === s.value}
                disabled={updateSettings.isPending}
                className={cn(
                  'flex flex-col gap-0.5 rounded-card border px-4 py-3 text-left transition-colors',
                  strategy === s.value
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-surface hover:border-accent',
                )}
              >
                <span className="text-sm font-medium text-ink">{s.label}</span>
                <span className="text-sm text-muted-foreground">{s.description}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <OllamaCard active={strategy === 'LLM'} />

        <HomeAssistantCard />

        <Card>
          <CardHeader>
            <CardTitle>Phone calendar (CalDAV)</CardTitle>
            <CardDescription>
              Serve the household calendar over CalDAV so members can read and write it from their
              phone&apos;s calendar app. Each member generates an app password under their profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              role="switch"
              aria-checked={caldavEnabled}
              disabled={updateSettings.isPending}
              onClick={() => updateSettings.mutate({ caldavEnabled: !caldavEnabled })}
              className={cn(
                'flex items-center gap-3 rounded-card border px-4 py-3 text-left transition-colors',
                caldavEnabled ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-11 shrink-0 items-center rounded-pill p-0.5 transition-colors',
                  caldavEnabled ? 'bg-accent' : 'bg-line',
                )}
              >
                <span
                  className={cn(
                    'size-5 rounded-pill bg-surface transition-transform',
                    caldavEnabled && 'translate-x-5',
                  )}
                />
              </span>
              <span className="text-sm font-medium text-ink">
                {caldavEnabled ? 'CalDAV server enabled' : 'CalDAV server off'}
              </span>
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

/** Ollama connection form — relevant when the LLM strategy is selected. */
function OllamaCard({ active }: { active: boolean }) {
  const { data: config } = useOllamaConfig()
  const updateConfig = useUpdateOllamaConfig()
  const probeModels = useProbeOllamaModels()

  const [url, setUrl] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [probe, setProbe] = useState<OllamaTestResult | null>(null)
  // The URL the current `probe` result belongs to, so we re-probe only on real changes.
  const probedUrl = useRef<string | null>(null)
  // Stable handle to the probe mutation so callbacks don't churn each render.
  const probeRef = useRef(probeModels)
  probeRef.current = probeModels

  /** Probe a URL for its models; keep the chosen model valid against the result. */
  const runProbe = useCallback(async (target: string) => {
    const trimmed = target.trim()
    probedUrl.current = trimmed
    setError(null)
    if (!trimmed) return setProbe(null)
    try {
      const result = await probeRef.current.mutateAsync({ url: trimmed })
      setProbe(result)
      // Default the model to the first available only if the current one isn't there.
      setModel((m) =>
        result.models.length > 0 && !result.models.includes(m) ? result.models[0] : m,
      )
    } catch (err) {
      setProbe(null)
      setError(err instanceof ApiError ? err.message : 'Enter a valid URL to list models.')
    }
  }, [])

  // Seed the local fields from the saved config exactly once, then probe its URL.
  // (Re-seeding on every render would clobber what the user is typing.)
  const seeded = useRef(false)
  useEffect(() => {
    if (config && !seeded.current) {
      seeded.current = true
      setUrl(config.url ?? '')
      setModel(config.model)
      if (config.url) void runProbe(config.url)
    }
  }, [config, runProbe])

  function handleUrlBlur() {
    if (url.trim() && url.trim() !== probedUrl.current) void runProbe(url)
  }

  async function handleSave() {
    setError(null)
    try {
      await updateConfig.mutateAsync({
        url: url.trim(),
        model: model.trim() || DEFAULT_OLLAMA_MODEL,
        isActive: true,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the Ollama settings.')
    }
  }

  const models = probe?.models ?? []

  return (
    <Card className={cn(!active && 'opacity-70')}>
      <CardHeader>
        <CardTitle>Ollama (language model)</CardTitle>
        <CardDescription>
          {active
            ? 'Self-hosted Ollama server used by the language-model normaliser.'
            : 'Used only when the "Language model" strategy is selected above.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-url">Server URL</Label>
          <div className="flex gap-2">
            <Input
              id="ollama-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="http://localhost:11434"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void runProbe(url)}
              disabled={probeModels.isPending || !url.trim()}
            >
              {probeModels.isPending ? 'Checking…' : 'Check'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Models are listed automatically when you finish typing the URL.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ollama-model">Model</Label>
          {models.length > 0 ? (
            <select
              id="ollama-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-control border border-input bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="ollama-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_OLLAMA_MODEL}
            />
          )}
        </div>

        {error && <p className="text-sm text-warning">{error}</p>}
        {probe && (
          <p
            className={cn(
              'flex items-start gap-2 text-sm',
              probe.ok ? 'text-sage' : 'text-warning',
            )}
          >
            {probe.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" />
            )}
            {probe.message}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => void handleSave()} disabled={updateConfig.isPending}>
            {updateConfig.isPending ? 'Saving…' : 'Save'}
          </Button>
          {config?.lastConnectedAt && (
            <span className="text-xs text-muted-foreground">
              Last connected {new Date(config.lastConnectedAt).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const HA_STATUS_LABELS: Record<HaConnectionStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  auth_failed: 'Token rejected',
  error: 'Connection error',
}

/** Home Assistant connection form (spec §10 Phase 6). */
function HomeAssistantCard() {
  const { data: config } = useHomeAssistantConfig()
  const updateConfig = useUpdateHomeAssistantConfig()
  const testConn = useTestHomeAssistant()

  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<HomeAssistantTestResult | null>(null)

  // Seed the URL from the saved config once; the token is write-only and never
  // returned, so its field stays blank ("leave blank to keep the stored one").
  const seeded = useRef(false)
  useEffect(() => {
    if (config && !seeded.current) {
      seeded.current = true
      setUrl(config.url ?? '')
    }
  }, [config])

  async function handleTest() {
    setError(null)
    setTest(null)
    try {
      setTest(await testConn.mutateAsync({ url: url.trim(), accessToken: token.trim() }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enter a URL and token to test.')
    }
  }

  async function handleSave(isActive: boolean) {
    setError(null)
    try {
      await updateConfig.mutateAsync({
        url: url.trim(),
        // Omit the token when blank so the stored one is kept.
        ...(token.trim() && { accessToken: token.trim() }),
        isActive,
      })
      setToken('')
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not save the Home Assistant settings.',
      )
    }
  }

  const status = config?.status ?? 'disconnected'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Home Assistant</CardTitle>
        <CardDescription>
          Connect a self-hosted Home Assistant for smart-home controls and live sensor data on the
          dashboard. Paste a long-lived access token (Profile → Security in Home Assistant).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium',
              status === 'connected'
                ? 'bg-accent-soft text-sage'
                : status === 'auth_failed' || status === 'error'
                  ? 'bg-accent-soft text-warning'
                  : 'bg-accent-soft text-muted-foreground',
            )}
          >
            {HA_STATUS_LABELS[status]}
          </span>
          {config?.haVersion && (
            <span className="text-xs text-muted-foreground">Home Assistant {config.haVersion}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ha-url">Server URL</Label>
          <Input
            id="ha-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://homeassistant.local:8123"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ha-token">Access token</Label>
          <Input
            id="ha-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              config?.hasToken ? 'Token set — leave blank to keep' : 'Long-lived access token'
            }
            autoComplete="off"
          />
        </div>

        {error && <p className="text-sm text-warning">{error}</p>}
        {test && (
          <p
            className={cn('flex items-start gap-2 text-sm', test.ok ? 'text-sage' : 'text-warning')}
          >
            {test.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" />
            )}
            {test.message}
            {test.version ? ` (v${test.version})` : ''}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => void handleSave(true)}
            disabled={updateConfig.isPending || !url.trim()}
          >
            {updateConfig.isPending ? 'Saving…' : 'Save & connect'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleTest()}
            disabled={testConn.isPending || !url.trim() || !token.trim()}
          >
            {testConn.isPending ? 'Testing…' : 'Test connection'}
          </Button>
          {config?.isActive && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleSave(false)}
              disabled={updateConfig.isPending}
            >
              Disconnect
            </Button>
          )}
          {config?.lastConnectedAt && (
            <span className="text-xs text-muted-foreground">
              Last connected {new Date(config.lastConnectedAt).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
