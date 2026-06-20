import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { NormaliserStrategy, OllamaTestResult, PublicUser } from '@hame/shared'
import { DEFAULT_OLLAMA_MODEL } from '@hame/shared'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ApiError } from '@/api/client'
import { useCurrentUser } from '@/api/auth'
import { useHouseholdSettings, useUpdateHouseholdSettings } from '@/api/household-settings'
import { useOllamaConfig, useProbeOllamaModels, useUpdateOllamaConfig } from '@/api/ollama-config'

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
  const { data: me } = useCurrentUser()
  const { data: settings } = useHouseholdSettings()
  const updateSettings = useUpdateHouseholdSettings()

  const strategy = settings?.ingredientNormaliser ?? 'BASIC'

  function chooseStrategy(value: NormaliserStrategy) {
    if (value !== strategy) updateSettings.mutate({ ingredientNormaliser: value })
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Settings</h1>
        <AppNav user={(me as PublicUser | null) ?? null} />
      </header>

      <Card className="max-w-2xl">
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
    <Card className={cn('max-w-2xl', !active && 'opacity-70')}>
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
