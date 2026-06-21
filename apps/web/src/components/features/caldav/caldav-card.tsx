import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import type { CalDavConnection, CalDavCredentialCreated } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError } from '@/api/client'
import { useCurrentUser } from '@/api/auth'
import { useHouseholdSettings } from '@/api/household-settings'
import {
  useCalDavConnection,
  useCalDavCredentials,
  useCreateCalDavCredential,
  useDeleteCalDavCredential,
} from '@/api/caldav'

/**
 * The base URL a CalDAV client (DAVx5) connects to. Preference:
 *   1. the configured public/domain URL (`CALDAV_PUBLIC_URL`), for real deployments;
 *   2. the server's detected LAN address + this page's port, for local testing
 *      (so a phone gets a reachable IP instead of `localhost`);
 *   3. the browser origin, as a last resort.
 */
function caldavUrl(conn: CalDavConnection | undefined): string {
  if (conn?.publicUrl) return conn.publicUrl
  const onLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  if (onLocalhost && conn?.lanAddress) {
    const port = window.location.port ? `:${window.location.port}` : ''
    return `${window.location.protocol}//${conn.lanAddress}${port}`
  }
  return window.location.origin
}

/**
 * Per-user CalDAV connection panel (spec §10 Phase 5.5): the server URL, plus
 * app passwords to mint/revoke for phone calendar clients. Only meaningful once
 * an admin has enabled CalDAV for the household.
 */
export function CalDavCard() {
  const { data: user } = useCurrentUser()
  const { data: settings } = useHouseholdSettings()
  const { data: credentials } = useCalDavCredentials()
  const { data: connection } = useCalDavConnection()
  const createCred = useCreateCalDavCredential()
  const deleteCred = useDeleteCalDavCredential()

  const serverUrl = caldavUrl(connection)

  const [label, setLabel] = useState('')
  const [created, setCreated] = useState<CalDavCredentialCreated | null>(null)
  const [error, setError] = useState<string | null>(null)

  const enabled = settings?.caldavEnabled ?? false

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!label.trim()) return setError('Name the device.')
    try {
      setCreated(await createCred.mutateAsync({ label: label.trim() }))
      setLabel('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the app password.')
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Phone calendar (CalDAV)</CardTitle>
        <CardDescription>
          Sync the household calendar to your phone&apos;s calendar app (e.g. DAVx5), two-way.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!enabled ? (
          <p className="text-sm text-muted-foreground">
            CalDAV is turned off. An admin can enable it under Settings.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1 rounded-control border border-line bg-bg p-3 text-sm">
              <span className="text-muted-foreground">Server URL</span>
              <code className="font-mono text-ink">{serverUrl}</code>
              <span className="mt-1 text-muted-foreground">Username</span>
              <code className="font-mono text-ink">{user?.username}</code>
            </div>

            {credentials && credentials.length > 0 && (
              <ul className="flex flex-col gap-2">
                {credentials.map((cred) => (
                  <li
                    key={cred.id}
                    className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{cred.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {cred.lastUsedAt
                          ? `Last used ${format(new Date(cred.lastUsedAt), 'd MMM')}`
                          : 'Never used'}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Revoke ${cred.label}`}
                      onClick={() => void deleteCred.mutateAsync(cred.id)}
                      className="text-muted-foreground transition-colors hover:text-warning"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {created && (
              <div className="flex flex-col gap-1 rounded-control border border-accent bg-accent-soft p-3 text-sm">
                <span className="font-medium text-ink">App password for {created.label}</span>
                <code className="select-all font-mono text-lg text-accent">{created.password}</code>
                <span className="text-xs text-muted-foreground">
                  Copy it now — it won&apos;t be shown again.
                </span>
              </div>
            )}

            <form onSubmit={handleCreate} className="flex flex-col gap-2">
              <Label htmlFor="cred-label">New app password</Label>
              <div className="flex gap-2">
                <Input
                  id="cred-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Pixel 8"
                />
                <Button type="submit" disabled={createCred.isPending}>
                  Create
                </Button>
              </div>
              {error && <p className="text-sm text-warning">{error}</p>}
            </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}
