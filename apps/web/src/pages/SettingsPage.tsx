import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import type {
  HaConnectionStatus,
  HomeAssistantTestResult,
  IdleModeSettings,
  ImmichTestResult,
  NormaliserStrategy,
  OllamaTestResult,
  WifiSecurity,
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
import { useUpdateWifiConfig, useWifiConfig } from '@/api/wifi'
import {
  useImmichAlbums,
  useImmichConfig,
  useTestImmich,
  useUpdateImmichConfig,
} from '@/api/immich'
import { useIdleSettings, useUpdateIdleSettings } from '@/api/idle'

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

        <WifiCard />

        <ImmichCard />

        <IdleModeCard />

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

        <LabsCard />
      </div>
    </main>
  )
}

/** Beta/experimental household features (spec §10 Phase 8.5). */
function LabsCard() {
  const { data: settings } = useHouseholdSettings()
  const updateSettings = useUpdateHouseholdSettings()
  const qc = useQueryClient()

  const enabled = settings?.autoConsumableCadence ?? false

  function toggle() {
    updateSettings.mutate(
      { autoConsumableCadence: !enabled },
      // The consumables list recomputes its cadence states server-side, so refetch it.
      { onSuccess: () => void qc.invalidateQueries({ queryKey: ['consumables'] }) },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Labs</CardTitle>
        <CardDescription>Experimental features, still being tried out.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ToggleRow
          label={enabled ? 'Auto consumable cadence on' : 'Auto consumable cadence off'}
          checked={enabled}
          disabled={updateSettings.isPending}
          onChange={toggle}
        />
        <p className="text-sm text-muted-foreground">
          Estimates how often you re-order each consumable from your shopping history — no need to
          type a cadence. After <strong>three</strong> shops it suggests one you can accept; after{' '}
          <strong>four</strong> regular shops it applies the estimate automatically, so the item
          starts showing a <strong>Due</strong> chip when it&apos;s likely running low. It only ever
          highlights and pre-ticks items — nothing is added to a list without you. A cadence you
          type yourself always wins and is never overwritten. Off by default; turning it off reverts
          to typed cadences only.
        </p>
      </CardContent>
    </Card>
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

const WIFI_SECURITY_OPTIONS: { value: WifiSecurity; label: string }[] = [
  { value: 'WPA', label: 'WPA / WPA2' },
  { value: 'WEP', label: 'WEP' },
  { value: 'NONE', label: 'Open (no password)' },
]

/** WiFi network details for the dashboard's scan-to-join QR widget (spec §10 Phase 7.2). */
function WifiCard() {
  const { data: config } = useWifiConfig()
  const updateConfig = useUpdateWifiConfig()

  const [ssid, setSsid] = useState('')
  const [security, setSecurity] = useState<WifiSecurity>('WPA')
  const [password, setPassword] = useState('')
  const [hidden, setHidden] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Seed from the saved config once; the password is returned (it's shown openly
  // as a QR), so we prefill it rather than do a "leave blank to keep" dance.
  const seeded = useRef(false)
  useEffect(() => {
    if (config && !seeded.current) {
      seeded.current = true
      setSsid(config.ssid)
      setSecurity(config.security)
      setPassword(config.password)
      setHidden(config.hidden)
      setIsActive(config.isActive)
    }
  }, [config])

  async function handleSave() {
    setError(null)
    setSaved(false)
    try {
      await updateConfig.mutateAsync({ ssid: ssid.trim(), security, password, hidden, isActive })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the WiFi settings.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WiFi QR code</CardTitle>
        <CardDescription>
          Set your network details so the dashboard can show a scan-to-join QR code. Anyone who can
          see the wall tablet can join — the password is encrypted at rest but shown openly in the
          code.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wifi-ssid">Network name (SSID)</Label>
          <Input
            id="wifi-ssid"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="My Home Network"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wifi-security">Security</Label>
          <select
            id="wifi-security"
            value={security}
            onChange={(e) => setSecurity(e.target.value as WifiSecurity)}
            className="rounded-control border border-input bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {WIFI_SECURITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {security !== 'NONE' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wifi-password">Password</Label>
            <Input
              id="wifi-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Network password"
              autoComplete="off"
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Hidden network (SSID isn&apos;t broadcast)
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Show the WiFi QR widget on the dashboard
        </label>

        {error && <p className="text-sm text-warning">{error}</p>}
        {saved && !error && (
          <p className="flex items-center gap-2 text-sm text-sage">
            <CheckCircle2 className="size-4 shrink-0" />
            Saved.
          </p>
        )}

        <div>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={updateConfig.isPending || !ssid.trim()}
          >
            {updateConfig.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** A labelled on/off switch matching the CalDAV toggle, for the idle settings. */
function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-left"
    >
      <span
        className={cn(
          'flex h-6 w-11 shrink-0 items-center rounded-pill p-0.5 transition-colors',
          checked ? 'bg-accent' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'size-5 rounded-pill bg-surface transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
    </button>
  )
}

/** Immich photo library for the idle screensaver (spec §10 Phase 7.3). */
function ImmichCard() {
  const { data: config } = useImmichConfig()
  const updateConfig = useUpdateImmichConfig()
  const testConn = useTestImmich()
  // The album list needs a working connection; only fetch once a key is stored.
  const { data: albums } = useImmichAlbums(Boolean(config?.hasApiKey))

  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<ImmichTestResult | null>(null)

  // Seed once; the key is write-only and never returned, so its field stays blank.
  const seeded = useRef(false)
  useEffect(() => {
    if (config && !seeded.current) {
      seeded.current = true
      setUrl(config.url ?? '')
      setSelected(config.selectedAlbumIds)
    }
  }, [config])

  function toggleAlbum(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]))
  }

  async function handleTest() {
    setError(null)
    setTest(null)
    try {
      setTest(await testConn.mutateAsync({ url: url.trim(), apiKey: apiKey.trim() }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enter a URL and key to test.')
    }
  }

  async function handleSave(isActive: boolean) {
    setError(null)
    try {
      await updateConfig.mutateAsync({
        url: url.trim(),
        // Omit the key when blank so the stored one is kept.
        ...(apiKey.trim() && { apiKey: apiKey.trim() }),
        selectedAlbumIds: selected,
        isActive,
      })
      setApiKey('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the Immich settings.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Immich (photo screensaver)</CardTitle>
        <CardDescription>
          Connect a self-hosted Immich library so the wall tablet shows your photos when idle. The
          API key is encrypted at rest and never leaves the server — photos are proxied through
          Hame. Create a key in Immich under Account Settings → API Keys.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="immich-url">Server URL</Label>
          <Input
            id="immich-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://immich.local:2283"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="immich-key">API key</Label>
          <Input
            id="immich-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.hasApiKey ? 'Key set — leave blank to keep' : 'Immich API key'}
            autoComplete="off"
          />
        </div>

        {albums && albums.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label>Albums</Label>
            <p className="text-xs text-muted-foreground">
              Leave all unchecked to show every photo.
            </p>
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-card border border-line p-2">
              {albums.map((album) => (
                <label key={album.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={selected.includes(album.id)}
                    onChange={() => toggleAlbum(album.id)}
                    className="size-4 rounded border-input"
                  />
                  <span className="truncate">{album.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {album.assetCount}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

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
            {updateConfig.isPending ? 'Saving…' : 'Save & enable'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleTest()}
            disabled={testConn.isPending || !url.trim() || !apiKey.trim()}
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
              Disable
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

const IDLE_NUMBERS: {
  key: 'activationMinutes' | 'photoDisplaySeconds' | 'clockDisplaySeconds'
  label: string
  hint: string
}[] = [
  {
    key: 'activationMinutes',
    label: 'Activate after (minutes idle)',
    hint: 'Inactivity before the screensaver starts.',
  },
  {
    key: 'photoDisplaySeconds',
    label: 'Photo duration (seconds)',
    hint: 'How long each photo shows.',
  },
  {
    key: 'clockDisplaySeconds',
    label: 'Clock duration (seconds)',
    hint: 'How long the clock shows between photo runs.',
  },
]

/** Wall-tablet idle/screensaver behaviour (spec §8.14, §10 Phase 7.3). */
function IdleModeCard() {
  const { data: settings } = useIdleSettings()
  const update = useUpdateIdleSettings()

  const [form, setForm] = useState<IdleModeSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seeded = useRef(false)
  useEffect(() => {
    if (settings && !seeded.current) {
      seeded.current = true
      setForm(settings)
    }
  }, [settings])

  if (!form) return null

  function set<K extends keyof IdleModeSettings>(key: K, value: IdleModeSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  async function handleSave() {
    if (!form) return
    setError(null)
    setSaved(false)
    try {
      await update.mutateAsync({
        enabled: form.enabled,
        activationMinutes: form.activationMinutes,
        photoDisplaySeconds: form.photoDisplaySeconds,
        clockDisplaySeconds: form.clockDisplaySeconds,
        shufflePhotos: form.shufflePhotos,
        showWeatherInClockMode: form.showWeatherInClockMode,
        immichEnabled: form.immichEnabled,
        showBinsInIdle: form.showBinsInIdle,
        showMealsInIdle: form.showMealsInIdle,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the idle settings.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Idle mode (screensaver)</CardTitle>
        <CardDescription>
          When the wall tablet&apos;s Household dashboard is left idle it becomes a photo frame —
          cycling Immich photos, a large clock, and (when there&apos;s something to show) bin and
          meal reminders. Touch wakes it. It runs only on the device showing the Household
          dashboard, not on phones. These settings are shared across the household.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleRow
          label={form.enabled ? 'Idle mode on' : 'Idle mode off'}
          checked={form.enabled}
          disabled={update.isPending}
          onChange={(v) => set('enabled', v)}
        />

        <div className={cn('flex flex-col gap-4', !form.enabled && 'opacity-60')}>
          {IDLE_NUMBERS.map(({ key, label, hint }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`idle-${key}`}>{label}</Label>
              <Input
                id={`idle-${key}`}
                type="number"
                min={1}
                value={form[key]}
                disabled={!form.enabled}
                onChange={(e) => set(key, Math.max(1, Number(e.target.value) || 0))}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}

          <ToggleRow
            label="Show photos (off = clock only)"
            checked={form.immichEnabled}
            disabled={!form.enabled || update.isPending}
            onChange={(v) => set('immichEnabled', v)}
          />
          <ToggleRow
            label="Shuffle photos"
            checked={form.shufflePhotos}
            disabled={!form.enabled || update.isPending}
            onChange={(v) => set('shufflePhotos', v)}
          />
          <ToggleRow
            label="Show weather on the clock screen"
            checked={form.showWeatherInClockMode}
            disabled={!form.enabled || update.isPending}
            onChange={(v) => set('showWeatherInClockMode', v)}
          />
          <ToggleRow
            label="Show bin reminders (a bin due today or tomorrow)"
            checked={form.showBinsInIdle}
            disabled={!form.enabled || update.isPending}
            onChange={(v) => set('showBinsInIdle', v)}
          />
          <ToggleRow
            label="Show today's meal (for the current time of day)"
            checked={form.showMealsInIdle}
            disabled={!form.enabled || update.isPending}
            onChange={(v) => set('showMealsInIdle', v)}
          />
        </div>

        {error && <p className="text-sm text-warning">{error}</p>}
        {saved && !error && (
          <p className="flex items-center gap-2 text-sm text-sage">
            <CheckCircle2 className="size-4 shrink-0" />
            Saved.
          </p>
        )}

        <div>
          <Button type="button" onClick={() => void handleSave()} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
