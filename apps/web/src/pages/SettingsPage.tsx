import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import type {
  BackupFrequency,
  HaConnectionStatus,
  HomeAssistantTestResult,
  IdleModeSettings,
  ImmichTestResult,
  NormaliserStrategy,
  OllamaTestResult,
  SleepModeSettings,
  WifiSecurity,
} from '@hame/shared'
import { BACKUP_RETENTION_MAX, BACKUP_RETENTION_MIN, DEFAULT_OLLAMA_MODEL } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, type TabItem } from '@/components/ui/tabs'
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
import { useSleepModeSettings, useUpdateSleepModeSettings } from '@/api/sleep-mode'
import {
  useBackupSettings,
  useExportBackup,
  useImportBackup,
  useRunBackup,
  useUpdateBackupSettings,
} from '@/api/backup'
import { IntegrationsCard } from '@/components/features/integrations/IntegrationsCard'
import { TagsCard } from '@/components/features/tags/TagsCard'
import { useCalDavConnection } from '@/api/caldav'
import { caldavCollectionUrl, caldavUrl } from '@/lib/caldav'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/stores/toast'
import { BackupEnvelopeSchema } from '@hame/shared'

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

const SETTINGS_TABS: TabItem[] = [
  { value: 'recipes', label: 'Recipes' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'tags', label: 'Tags' },
  { value: 'smart-home', label: 'Smart home' },
  { value: 'screensaver', label: 'Screensaver' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'data', label: 'Data' },
  { value: 'labs', label: 'Labs' },
]

/** A single row of one or two related setting cards within a tab panel. */
function TabPanel({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{children}</div>
}

/** Admin-only household settings, grouped into tabs (spec §10). */
export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const activeTab = SETTINGS_TABS.some((t) => t.value === requested)
    ? (requested as string)
    : SETTINGS_TABS[0].value

  function setTab(value: string) {
    setSearchParams(
      (prev) => {
        prev.set('tab', value)
        return prev
      },
      { replace: true },
    )
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <h1 className="font-serif text-3xl font-medium text-ink">Settings</h1>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto border-b border-line px-3 pt-2">
          <Tabs tabs={SETTINGS_TABS} value={activeTab} onValueChange={setTab} />
        </div>

        <div className="p-5 [&_.bg-card]:border-2">
          {activeTab === 'recipes' && (
            <TabPanel>
              <NormalisationCard />
            </TabPanel>
          )}
          {activeTab === 'pantry' && (
            <TabPanel>
              <BarcodeLookupCard />
            </TabPanel>
          )}
          {activeTab === 'tags' && <TagsCard />}
          {activeTab === 'smart-home' && (
            <TabPanel>
              <HomeAssistantCard />
              <WifiCard />
              <HouseholdAlertsCard />
            </TabPanel>
          )}
          {activeTab === 'screensaver' && (
            <TabPanel>
              <ImmichCard />
              <IdleModeCard />
              <SleepModeCard />
            </TabPanel>
          )}
          {activeTab === 'integrations' && <IntegrationsCard />}
          {activeTab === 'calendar' && <CalDavServerCard />}
          {activeTab === 'data' && (
            <TabPanel>
              <DataCard />
              <AutoBackupCard />
            </TabPanel>
          )}
          {activeTab === 'labs' && <LabsCard />}
        </div>
      </Card>
    </main>
  )
}

/** Ingredient normalisation strategy + its Ollama connection (spec §10 Phase 4.5). */
function NormalisationCard() {
  const { data: settings } = useHouseholdSettings()
  const updateSettings = useUpdateHouseholdSettings()
  const strategy = settings?.ingredientNormaliser ?? 'BASIC'

  function chooseStrategy(value: NormaliserStrategy) {
    if (value !== strategy) updateSettings.mutate({ ingredientNormaliser: value })
  }

  return (
    <>
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
    </>
  )
}

/** Admin toggle for the household CalDAV server (spec §10 Phase 9). */
function CalDavServerCard() {
  const { data: settings } = useHouseholdSettings()
  const updateSettings = useUpdateHouseholdSettings()
  const { data: connection } = useCalDavConnection()
  const caldavEnabled = settings?.caldavEnabled ?? false

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phone calendar (CalDAV)</CardTitle>
        <CardDescription>
          Serve the household calendar over CalDAV so members can read and write it from their
          phone&apos;s calendar app. Each member generates an app password under their profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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

        {caldavEnabled && (
          <div className="flex flex-col gap-1 rounded-control border border-line bg-bg p-3 text-sm">
            <span className="text-muted-foreground">Members connect their phones to</span>
            <code className="break-all font-mono text-ink">
              {caldavCollectionUrl(caldavUrl(connection))}
            </code>
            {connection?.publicUrl ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Pinned by <code className="font-mono">CALDAV_PUBLIC_URL</code> in the server
                environment.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                This follows however you&apos;re currently reaching Hame. To always advertise a
                fixed public address (e.g.{' '}
                <code className="font-mono">https://hame.example.com</code>
                ), set <code className="font-mono">CALDAV_PUBLIC_URL</code> in the server
                environment and restart.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Admin-only backup & restore of the whole database (spec §10 Phase 8.8). */
function DataCard() {
  const exportBackup = useExportBackup()
  const importBackup = useImportBackup()

  const [exportPass, setExportPass] = useState('')
  const [importPass, setImportPass] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setError(null)
    if (exportPass.length < 8) {
      setError('Use a passphrase of at least 8 characters.')
      return
    }
    try {
      const envelope = await exportBackup.mutateAsync(exportPass)
      const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `hame-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setExportPass('')
      toast.success('Backup downloaded. Store it somewhere safe.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the backup.')
    }
  }

  function requestImport() {
    setError(null)
    if (!file) {
      setError('Choose a backup file to restore.')
      return
    }
    if (!importPass) {
      setError('Enter the backup passphrase.')
      return
    }
    setConfirmOpen(true)
  }

  async function handleImport() {
    if (!file) return
    setError(null)
    try {
      const parsed = BackupEnvelopeSchema.safeParse(JSON.parse(await file.text()))
      if (!parsed.success) {
        setConfirmOpen(false)
        setError('That file is not a valid Hame backup.')
        return
      }
      const result = await importBackup.mutateAsync({
        passphrase: importPass,
        envelope: parsed.data,
      })
      setConfirmOpen(false)
      toast.success(`Restored ${result.totalRows} records. Reloading…`)
      // The restored data replaces every user (and their session state), so a full
      // reload re-runs the auth gate — signing you in again, or out if your account
      // isn't in the backup.
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setConfirmOpen(false)
      setError(err instanceof ApiError ? err.message : 'Could not restore the backup.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data (backup &amp; restore)</CardTitle>
        <CardDescription>
          Export the whole household to a single encrypted file, or restore it onto a fresh server.
          The file is protected by a passphrase you choose — keep both safe, as it can&apos;t be
          opened without the passphrase.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="backup-export-pass">Backup passphrase</Label>
          <Input
            id="backup-export-pass"
            type="password"
            value={exportPass}
            onChange={(e) => setExportPass(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="off"
          />
          <Button
            className="mt-1 self-start"
            onClick={handleExport}
            disabled={exportBackup.isPending}
          >
            {exportBackup.isPending ? 'Preparing…' : 'Download backup'}
          </Button>
        </div>

        <hr className="border-line" />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="backup-file">Restore from a backup</Label>
          <input
            id="backup-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-control file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground"
          />
          <Input
            className="mt-1"
            type="password"
            value={importPass}
            onChange={(e) => setImportPass(e.target.value)}
            placeholder="Backup passphrase"
            autoComplete="off"
          />
          <Button
            variant="destructive"
            className="mt-1 self-start"
            onClick={requestImport}
            disabled={importBackup.isPending}
          >
            {importBackup.isPending ? 'Restoring…' : 'Restore backup'}
          </Button>
          <p className="text-sm text-muted-foreground">
            Restoring replaces everything currently in Hame and signs you out.
          </p>
        </div>

        {error && <p className="text-sm text-warning">{error}</p>}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        title="Restore this backup?"
        confirmLabel="Restore & replace"
        pendingLabel="Restoring…"
        pending={importBackup.isPending}
        onConfirm={handleImport}
        onCancel={() => setConfirmOpen(false)}
      >
        This permanently erases all current data in Hame and replaces it with the contents of the
        backup file. It can&apos;t be undone.
      </ConfirmDialog>
    </Card>
  )
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

/**
 * Admin-only automated on-disk backups (spec §10 Phase 8.9). Schedules the same
 * encrypted export written to the server's BACKUP_DIR with rolling retention.
 */
function AutoBackupCard() {
  const { data: settings } = useBackupSettings()
  const update = useUpdateBackupSettings()
  const runBackup = useRunBackup()

  const [enabled, setEnabled] = useState(false)
  const [frequency, setFrequency] = useState<BackupFrequency>('DAILY')
  const [hour, setHour] = useState(3)
  const [weekday, setWeekday] = useState(0)
  const [retentionCount, setRetentionCount] = useState(7)
  const [passphrase, setPassphrase] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seeded = useRef(false)
  useEffect(() => {
    if (settings && !seeded.current) {
      seeded.current = true
      setEnabled(settings.enabled)
      setFrequency(settings.frequency)
      setHour(settings.hour)
      setWeekday(settings.weekday)
      setRetentionCount(settings.retentionCount)
    }
  }, [settings])

  if (!settings) return null
  const hasPassphrase = settings.hasPassphrase

  async function handleSave() {
    setError(null)
    setSaved(false)
    if (enabled && !hasPassphrase && passphrase.length < 8) {
      setError('Set a passphrase of at least 8 characters before enabling automated backups.')
      return
    }
    if (passphrase && passphrase.length < 8) {
      setError('Use a passphrase of at least 8 characters.')
      return
    }
    try {
      await update.mutateAsync({
        enabled,
        frequency,
        hour,
        weekday,
        retentionCount,
        ...(passphrase ? { passphrase } : {}),
      })
      setPassphrase('')
      setSaved(true)
      toast.success('Backup schedule saved.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the backup schedule.')
    }
  }

  async function handleRunNow() {
    setError(null)
    setSaved(false)
    try {
      const result = await runBackup.mutateAsync()
      toast.success(`Backup written: ${result.filename} (${result.retained} kept).`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the backup.')
    }
  }

  const canRunNow = hasPassphrase || passphrase.length >= 8

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automated backups</CardTitle>
        <CardDescription>
          Have Hame write an encrypted backup to the server on a schedule, keeping a rolling set of
          the most recent files. They&apos;re saved to the backup directory on the host (outside the
          database and app container), so they survive even if those are lost. Restore one from the{' '}
          <strong>Data</strong> card above. Keep the passphrase safe — the files can&apos;t be
          opened without it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleRow
          label={enabled ? 'Automated backups on' : 'Automated backups off'}
          checked={enabled}
          disabled={update.isPending}
          onChange={setEnabled}
        />

        <div className={cn('flex flex-col gap-4', !enabled && 'opacity-60')}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="backup-frequency">How often</Label>
            <select
              id="backup-frequency"
              value={frequency}
              disabled={!enabled}
              onChange={(e) => {
                setFrequency(e.target.value as BackupFrequency)
                setSaved(false)
              }}
              className="w-40 rounded-control border border-input bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </div>

          {frequency === 'WEEKLY' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="backup-weekday">Day of the week</Label>
              <select
                id="backup-weekday"
                value={weekday}
                disabled={!enabled}
                onChange={(e) => {
                  setWeekday(Number(e.target.value))
                  setSaved(false)
                }}
                className="w-40 rounded-control border border-input bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {WEEKDAY_NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="backup-hour">Time of day (hour, UTC)</Label>
            <Input
              id="backup-hour"
              type="number"
              min={0}
              max={23}
              value={hour}
              disabled={!enabled}
              onChange={(e) => {
                setHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))
                setSaved(false)
              }}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              The hour (0–23) the backup runs, in the server&apos;s time (UTC by default).
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="backup-retention">Backups to keep</Label>
            <Input
              id="backup-retention"
              type="number"
              min={BACKUP_RETENTION_MIN}
              max={BACKUP_RETENTION_MAX}
              value={retentionCount}
              disabled={!enabled}
              onChange={(e) => {
                const n = Number(e.target.value) || BACKUP_RETENTION_MIN
                setRetentionCount(Math.min(BACKUP_RETENTION_MAX, Math.max(BACKUP_RETENTION_MIN, n)))
                setSaved(false)
              }}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Older files past this many are deleted automatically ({BACKUP_RETENTION_MIN}–
              {BACKUP_RETENTION_MAX}).
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="backup-auto-pass">
            {hasPassphrase ? 'Change the backup passphrase' : 'Backup passphrase'}
          </Label>
          <Input
            id="backup-auto-pass"
            type="password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value)
              setSaved(false)
            }}
            placeholder={
              hasPassphrase ? 'Leave blank to keep the current one' : 'At least 8 characters'
            }
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            {hasPassphrase
              ? 'A passphrase is set. You need it to restore any of these backups — store it somewhere safe, off this server.'
              : 'Used to encrypt every automated backup. Store it somewhere safe, off this server — the files can only be restored with it.'}
          </p>
        </div>

        {error && <p className="text-sm text-warning">{error}</p>}
        {saved && !error && (
          <p className="flex items-center gap-2 text-sm text-sage">
            <CheckCircle2 className="size-4 shrink-0" />
            Saved.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void handleSave()} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save schedule'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleRunNow()}
            disabled={runBackup.isPending || !canRunNow}
            title={canRunNow ? undefined : 'Set a passphrase first'}
          >
            {runBackup.isPending ? 'Backing up…' : 'Back up now'}
          </Button>
        </div>

        <div className="rounded-control border border-line bg-surface/50 p-3 text-xs text-muted-foreground">
          <p>
            Last backup: {formatDateTime(settings.lastRunAt)}
            {settings.lastStatus === 'FAILURE' && (
              <span className="ml-1 text-warning">
                (failed{settings.lastError ? `: ${settings.lastError}` : ''})
              </span>
            )}
            {settings.lastStatus === 'SUCCESS' && <span className="ml-1 text-sage">(ok)</span>}
          </p>
          {enabled && <p>Next scheduled: {formatDateTime(settings.nextRunAt)}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

/** Whether an unseen barcode may be looked up externally (spec §10 Phase 14). */
function BarcodeLookupCard() {
  const { data: settings } = useHouseholdSettings()
  const updateSettings = useUpdateHouseholdSettings()

  const enabled = settings?.barcodeLookupEnabled ?? true

  return (
    <Card>
      <CardHeader>
        <CardTitle>Barcode lookup</CardTitle>
        <CardDescription>Name a scanned product automatically.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ToggleRow
          label={enabled ? 'Barcode lookup on' : 'Barcode lookup off'}
          checked={enabled}
          disabled={updateSettings.isPending}
          onChange={() => updateSettings.mutate({ barcodeLookupEnabled: !enabled })}
        />
        <p className="text-sm text-muted-foreground">
          When you scan a barcode Hame hasn’t seen before, it asks <strong>Open Food Facts</strong>{' '}
          — a free, open product database — for the product name, so you can match it to an existing
          item instead of typing it. That sends the barcode (and nothing else) to{' '}
          <code>openfoodfacts.org</code>. A code you’ve already linked is looked up on your own
          server and never leaves your network. Turn this off to keep every scan local; scanning
          still works, you just name new products yourself.
        </p>
      </CardContent>
    </Card>
  )
}

/** Household alerts: the mobile top-bar critical-alert "poke" toggle (spec §10 Phase 12). */
function HouseholdAlertsCard() {
  const { data: settings } = useHouseholdSettings()
  const updateSettings = useUpdateHouseholdSettings()
  const qc = useQueryClient()

  const enabled = settings?.householdAlertsEnabled ?? true

  function toggle() {
    updateSettings.mutate(
      { householdAlertsEnabled: !enabled },
      // The top-bar icon reads the recipients endpoint; refetch so it appears/hides at once.
      { onSuccess: () => void qc.invalidateQueries({ queryKey: ['alert-recipients'] }) },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Household alerts</CardTitle>
        <CardDescription>Ping another member’s phone with an urgent alert.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ToggleRow
          label={enabled ? 'Household alerts on' : 'Household alerts off'}
          checked={enabled}
          disabled={updateSettings.isPending}
          onChange={toggle}
        />
        <p className="text-sm text-muted-foreground">
          Adds a bell icon to the phone top bar. Tap it to send a household member a short message
          that arrives as a <strong>critical alert</strong> — it rings through silent mode and Do
          Not Disturb. It’s delivered through Home Assistant, so each recipient must pick their
          phone under <strong>Profile → Notifications</strong> first. Turn this off and the icon
          disappears for everyone.
        </p>
      </CardContent>
    </Card>
  )
}

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
        showNotesInIdle: form.showNotesInIdle,
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
          cycling Immich photos, a large clock, and (when there&apos;s something to show) bin
          reminders, meals and the QuickNotes board. Touch wakes it. It runs only on the device
          showing the Household dashboard, not on phones. These settings are shared across the
          household.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleRow
          label={form.enabled ? 'Idle mode on' : 'Idle mode off'}
          checked={form.enabled}
          disabled={update.isPending}
          onChange={(v) => set('enabled', v)}
        />

        <div className={cn('grid gap-x-8 gap-y-6 sm:grid-cols-2', !form.enabled && 'opacity-60')}>
          <div className="flex flex-col gap-4">
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
          </div>

          <div className="flex flex-col gap-4">
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
            <ToggleRow
              label="Show the QuickNotes board (when the household has notes)"
              checked={form.showNotesInIdle}
              disabled={!form.enabled || update.isPending}
              onChange={(v) => set('showNotesInIdle', v)}
            />
          </div>
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

/** `<input type="time">` reads/writes `"HH:mm"`; settings store minutes-since-midnight. */
function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function SleepModeCard() {
  const { data: settings } = useSleepModeSettings()
  const update = useUpdateSleepModeSettings()

  const [form, setForm] = useState<SleepModeSettings | null>(null)
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

  function set<K extends keyof SleepModeSettings>(key: K, value: SleepModeSettings[K]) {
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
        startMinutes: form.startMinutes,
        endMinutes: form.endMinutes,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the sleep-mode schedule.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sleep mode</CardTitle>
        <CardDescription>
          Between these times, once the Household dashboard has gone idle, the wall tablet shows a
          plain black screen instead of the photo screensaver — touch wakes it, same as idle mode.
          Replaces relying on a separate kiosk app to blank the screen overnight. Times are the
          tablet&apos;s own local clock, not the server&apos;s.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleRow
          label={form.enabled ? 'Sleep mode on' : 'Sleep mode off'}
          checked={form.enabled}
          disabled={update.isPending}
          onChange={(v) => set('enabled', v)}
        />

        <div className={cn('flex gap-8', !form.enabled && 'opacity-60')}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sleep-start">Starts</Label>
            <Input
              id="sleep-start"
              type="time"
              value={minutesToTimeString(form.startMinutes)}
              disabled={!form.enabled}
              onChange={(e) => set('startMinutes', timeStringToMinutes(e.target.value))}
              className="w-32"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sleep-end">Ends</Label>
            <Input
              id="sleep-end"
              type="time"
              value={minutesToTimeString(form.endMinutes)}
              disabled={!form.enabled}
              onChange={(e) => set('endMinutes', timeStringToMinutes(e.target.value))}
              className="w-32"
            />
          </div>
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
