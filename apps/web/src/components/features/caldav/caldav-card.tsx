import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import type { CalDavCredentialCreated } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError } from '@/api/client'
import { useCurrentUser } from '@/api/auth'
import { useHouseholdSettings } from '@/api/household-settings'
import { QrCode } from '@/components/features/qr-code'
import { caldavCollectionUrl, caldavUrl } from '@/lib/caldav'
import {
  useCalDavConnection,
  useCalDavCredentials,
  useCreateCalDavCredential,
  useDeleteCalDavCredential,
} from '@/api/caldav'

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
  // The QR encodes an https bridge page (any camera opens it), which then offers a
  // one-tap deep link into DAVx5 — a raw davx5:// QR can't be launched by a phone's
  // stock camera. Carries no secret, only the username.
  const setupQr = user?.username
    ? `${serverUrl.replace(/\/$/, '')}/dav-setup?u=${encodeURIComponent(user.username)}`
    : null

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
    <Card>
      <CardHeader>
        <CardTitle>Phone calendar (CalDAV)</CardTitle>
        <CardDescription>
          Sync the household calendar to your phone&apos;s calendar app (e.g. DAVx5), two-way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!enabled ? (
          <p className="text-sm text-muted-foreground">
            CalDAV is turned off. An admin can enable it under Settings.
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
            {/* Left: the scannable setup QR — the quick way onto a phone. */}
            {setupQr && (
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-control border border-line bg-surface p-3">
                  <QrCode value={setupQr} className="size-64" title="Set up DAVx5" />
                </div>
                <p className="max-w-64 text-center text-xs text-muted-foreground">
                  Scan with your phone&apos;s camera to set up DAVx5.
                </p>
              </div>
            )}

            {/* Right: connection details, the device list, and the add form. */}
            <div className="flex min-w-0 flex-col gap-4">
              <div className="grid gap-x-6 gap-y-3 rounded-control border border-line bg-bg p-3 text-sm sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-muted-foreground">Server URL</span>
                  <code className="break-all font-mono text-ink">
                    {caldavCollectionUrl(serverUrl)}
                  </code>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-muted-foreground">Username</span>
                  <code className="font-mono text-ink">{user?.username}</code>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">Your devices</span>
                {credentials && credentials.length > 0 ? (
                  <ul className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
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
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No devices yet — create an app password to connect one.
                  </p>
                )}
              </div>

              {created && (
                <div className="flex flex-col gap-1 rounded-control border border-accent bg-accent-soft p-3 text-sm">
                  <span className="font-medium text-ink">App password for {created.label}</span>
                  <code className="select-all font-mono text-lg text-accent">
                    {created.password}
                  </code>
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
                    className="max-w-xs"
                  />
                  <Button type="submit" disabled={createCred.isPending}>
                    Create
                  </Button>
                </div>
                {error && <p className="text-sm text-warning">{error}</p>}
              </form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
