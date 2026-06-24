import { useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import type { CalendarSourceType } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/api/client'
import {
  useCalendarSources,
  useCreateCalendarSource,
  useDeleteCalendarSource,
  useSyncCalendarSource,
} from '@/api/calendar-sources'
import { useHaCalendars } from '@/api/home-assistant'
import { cn } from '@/lib/utils'

/**
 * Manage external iCal calendar feeds (spec §8.10): list, add, sync and remove.
 * Synced events flow into the aggregated calendar with the source's colour.
 */
export function CalendarSourcesManager() {
  const { data: sources, isPending } = useCalendarSources()
  const createSource = useCreateCalendarSource()
  const deleteSource = useDeleteCalendarSource()
  const syncSource = useSyncCalendarSource()

  const [type, setType] = useState<CalendarSourceType>('ICAL')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [colour, setColour] = useState('#2f6fb0')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isHa = type === 'HOME_ASSISTANT'
  // Only fetch HA's calendars once that source type is chosen (no-op otherwise).
  const haCalendars = useHaCalendars(isHa)

  function chooseType(next: CalendarSourceType) {
    setType(next)
    setUrl('') // the field means different things per type (feed URL vs entity id)
    setError(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (!name.trim()) return setError('Give the calendar a name.')
    if (!url.trim()) {
      return setError(isHa ? 'Choose a Home Assistant calendar.' : 'Paste the iCal URL.')
    }
    try {
      const created = await createSource.mutateAsync({
        name: name.trim(),
        url: url.trim(),
        colour,
        type,
      })
      setNotice(
        created.eventCount > 0
          ? `Added — synced ${created.eventCount} events.`
          : 'Added, but no events synced yet. Try Sync, or check the source.',
      )
      setName('')
      setUrl('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the calendar.')
    }
  }

  async function handleSync(id: string) {
    setError(null)
    setNotice(null)
    try {
      const result = await syncSource.mutateAsync(id)
      setNotice(result.message)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sources && sources.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2"
            >
              <span
                className="size-3.5 shrink-0 rounded"
                style={{ backgroundColor: source.colour }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{source.name}</p>
                <p className="text-xs text-muted-foreground">
                  {source.eventCount} events
                  {source.lastSyncedAt
                    ? ` · synced ${format(new Date(source.lastSyncedAt), 'd MMM HH:mm')}`
                    : ' · not yet synced'}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Sync ${source.name}`}
                onClick={() => void handleSync(source.id)}
                disabled={syncSource.isPending}
                className="text-muted-foreground transition-colors hover:text-accent"
              >
                <RefreshCw className={syncSource.isPending ? 'size-4 animate-spin' : 'size-4'} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${source.name}`}
                onClick={() => void deleteSource.mutateAsync(source.id)}
                disabled={deleteSource.isPending}
                className="text-muted-foreground transition-colors hover:text-warning"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No external calendars yet. Add an iCal URL (e.g. a Google Calendar secret address).
        </p>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Add a calendar
        </p>
        <div className="flex gap-2">
          {(
            [
              ['ICAL', 'iCal feed'],
              ['HOME_ASSISTANT', 'Home Assistant'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => chooseType(value)}
              className={cn(
                'rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors',
                type === value
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-surface text-muted-foreground hover:border-accent',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="src-name">Name</Label>
            <Input
              id="src-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ben's Google"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="src-colour">Colour</Label>
            <input
              id="src-colour"
              type="color"
              value={colour}
              onChange={(e) => setColour(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded-control border border-line bg-surface"
            />
          </div>
        </div>
        {isHa ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="src-ha">Home Assistant calendar</Label>
            <select
              id="src-ha"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-10 rounded-control border border-line bg-surface px-3 text-sm text-ink"
            >
              <option value="">
                {haCalendars.isPending
                  ? 'Loading calendars…'
                  : haCalendars.data && haCalendars.data.length > 0
                    ? 'Choose a calendar…'
                    : 'No Home Assistant calendars found'}
              </option>
              {haCalendars.data?.map((cal) => (
                <option key={cal.entityId} value={cal.entityId}>
                  {cal.name}
                </option>
              ))}
            </select>
            {haCalendars.isError && (
              <p className="text-xs text-warning">
                Couldn’t reach Home Assistant. Check its connection in Settings.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="src-url">iCal URL</Label>
            <Input
              id="src-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://calendar.google.com/…/basic.ics"
            />
          </div>
        )}

        {error && <p className="text-sm text-warning">{error}</p>}
        {notice && <p className="text-sm text-sage">{notice}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={createSource.isPending}>
            {createSource.isPending ? 'Adding…' : 'Add calendar'}
          </Button>
        </div>
      </form>
    </div>
  )
}
