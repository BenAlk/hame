import { useState } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type {
  BinCollection,
  CreateBinInput,
  CreateScraperBinsInput,
  PublicUser,
  Weekday,
} from '@hame/shared'
import { AppNav } from '@/components/app-nav'
import { BinForm } from '@/components/features/bins/bin-form'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/api/client'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/api/auth'
import {
  useBins,
  useCreateBin,
  useCreateScraperBins,
  useDeleteBin,
  useSyncBin,
  useUpdateBin,
} from '@/api/bins'

const WEEKDAY_SHORT: Record<Weekday, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

const SOURCE_LABEL: Record<Exclude<BinCollection['sourceType'], 'MANUAL'>, string> = {
  ICAL: 'From an iCal feed',
  SCRAPER: 'From the council scraper',
  HOME_ASSISTANT: 'From Home Assistant',
}

function scheduleSummary(bin: BinCollection): string {
  if (bin.sourceType !== 'MANUAL') return SOURCE_LABEL[bin.sourceType]
  switch (bin.recurrenceType) {
    case 'WEEKLY':
      return `Weekly on ${bin.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ')}`
    case 'INTERVAL':
      return bin.intervalDays === 14 ? 'Fortnightly' : `Every ${bin.intervalDays} days`
    case 'DATE_OF_MONTH':
      return `Monthly on the ${ordinal(bin.dayOfMonth ?? 1)}`
    default:
      return 'No schedule set'
  }
}

function relativeDay(date: Date | string): string {
  const diff = differenceInCalendarDays(new Date(date), new Date())
  if (diff <= 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return `in ${diff} days`
}

export function BinsPage() {
  const { data: me } = useCurrentUser()
  const { data: bins, isPending } = useBins()
  const createBin = useCreateBin()
  const createScraperBins = useCreateScraperBins()
  const updateBin = useUpdateBin()
  const deleteBin = useDeleteBin()
  const syncBin = useSyncBin()

  const [editing, setEditing] = useState<{ bin?: BinCollection } | null>(null)
  const [deleting, setDeleting] = useState<BinCollection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ id: string; ok: boolean; message: string } | null>(
    null,
  )

  async function handleSync(bin: BinCollection) {
    setSyncResult(null)
    try {
      const result = await syncBin.mutateAsync(bin.id)
      setSyncResult({ id: bin.id, ...result })
    } catch (err) {
      setSyncResult({
        id: bin.id,
        ok: false,
        message: err instanceof ApiError ? err.message : 'Could not sync the feed.',
      })
    }
  }

  async function handleSubmit(input: CreateBinInput) {
    setError(null)
    try {
      if (editing?.bin) await updateBin.mutateAsync({ id: editing.bin.id, ...input })
      else await createBin.mutateAsync(input)
      setEditing(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the bin.')
    }
  }

  async function handleSubmitBatch(input: CreateScraperBinsInput) {
    setError(null)
    try {
      await createScraperBins.mutateAsync(input)
      setEditing(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the bins.')
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setError(null)
    try {
      await deleteBin.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the bin.')
    }
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Bins</h1>
        <AppNav user={(me as PublicUser | null) ?? null} />
      </header>

      <div>
        <Button
          onClick={() => {
            setError(null)
            setEditing({})
          }}
        >
          <Plus className="size-4" />
          New bin
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !bins || bins.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bins yet. Add your collection schedule.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bins.map((bin) => (
            <div
              key={bin.id}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="size-4 shrink-0 rounded"
                    style={{ backgroundColor: bin.colour }}
                  />
                  <span className="font-semibold text-ink">{bin.name}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${bin.name}`}
                    onClick={() => {
                      setError(null)
                      setEditing({ bin })
                    }}
                    className="text-muted-foreground transition-colors hover:text-accent"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${bin.name}`}
                    onClick={() => setDeleting(bin)}
                    className="text-muted-foreground transition-colors hover:text-warning"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{scheduleSummary(bin)}</p>
              {bin.nextCollection ? (
                <p className="text-sm text-ink">
                  Next:{' '}
                  <span className="font-medium">
                    {format(new Date(bin.nextCollection), 'EEE d MMM')}
                  </span>{' '}
                  <span className="text-muted-foreground">({relativeDay(bin.nextCollection)})</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming collection</p>
              )}

              {bin.sourceType !== 'MANUAL' && (
                <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {bin.lastSyncedAt
                        ? `Synced ${format(new Date(bin.lastSyncedAt), 'd MMM, HH:mm')}`
                        : 'Not synced yet'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleSync(bin)}
                      disabled={syncBin.isPending}
                    >
                      <RefreshCw
                        className={cn(
                          'size-3.5',
                          syncBin.isPending && syncBin.variables === bin.id && 'animate-spin',
                        )}
                      />
                      Sync now
                    </Button>
                  </div>
                  {syncResult?.id === bin.id && (
                    <p
                      className={cn(
                        'text-xs',
                        syncResult.ok ? 'text-muted-foreground' : 'text-warning',
                      )}
                    >
                      {syncResult.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.bin ? 'Edit bin' : 'New bin'}
      >
        {editing && (
          <BinForm
            bin={editing.bin}
            onSubmit={handleSubmit}
            onSubmitBatch={handleSubmitBatch}
            onCancel={() => setEditing(null)}
            submitting={createBin.isPending || updateBin.isPending || createScraperBins.isPending}
            error={error}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete bin"
        pending={deleteBin.isPending}
        error={error}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      >
        Delete <strong>{deleting?.name}</strong>? Its collection schedule will be removed from the
        calendar.
      </ConfirmDialog>
    </main>
  )
}
