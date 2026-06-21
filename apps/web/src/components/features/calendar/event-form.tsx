import { useState } from 'react'
import type { CreateCustomEventInput } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** The subset of a custom event the form needs to prefill (notes aren't in the calendar feed). */
export interface EventFormInitial {
  title: string
  startTime: Date | string
  endTime: Date | string | null
  allDay: boolean
  colour: string | null
  description?: string | null
}

interface EventFormProps {
  event?: EventFormInitial
  /** Pre-selected day (yyyy-MM-dd) when adding from a calendar cell. */
  defaultDate?: string
  onSubmit: (input: CreateCustomEventInput) => void
  onCancel: () => void
  onDelete?: () => void
  submitting?: boolean
  error?: string | null
}

/** `Date` → value for a `datetime-local` input (local wall-clock, no seconds). */
function toLocalInput(date: Date | string): string {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `Date` → value for a `date` input (UTC date, matching all-day storage). */
function toDateInput(date: Date | string): string {
  return (typeof date === 'string' ? date : date.toISOString()).slice(0, 10)
}

/** Create/edit form for a free-form household calendar event (spec §8.10). */
export function EventForm({
  event,
  defaultDate,
  onSubmit,
  onCancel,
  onDelete,
  submitting,
  error,
}: EventFormProps) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [allDay, setAllDay] = useState(event?.allDay ?? true)
  const [date, setDate] = useState(
    event ? toDateInput(event.startTime) : (defaultDate ?? toDateInput(new Date())),
  )
  const [start, setStart] = useState(
    event && !event.allDay
      ? toLocalInput(event.startTime)
      : `${defaultDate ?? toDateInput(new Date())}T18:00`,
  )
  const [end, setEnd] = useState(event?.endTime ? toLocalInput(event.endTime) : '')
  const [colour, setColour] = useState(event?.colour ?? '#d16a6a')
  const [description, setDescription] = useState(event?.description ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!title.trim()) return setLocalError('Give the event a title.')

    let startTime: Date
    let endTime: Date | null = null
    if (allDay) {
      if (!date) return setLocalError('Choose a date.')
      startTime = new Date(`${date}T00:00:00.000Z`)
    } else {
      if (!start) return setLocalError('Choose a start time.')
      startTime = new Date(start)
      endTime = end ? new Date(end) : null
      if (endTime && endTime < startTime) return setLocalError('End must be after start.')
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      startTime,
      endTime,
      allDay,
      colour,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-title">Title</Label>
        <Input
          id="event-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Date night"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-4 accent-accent"
        />
        All day
      </label>

      {allDay ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-date">Date</Label>
          <Input
            id="event-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-start">Starts</Label>
            <Input
              id="event-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-end">Ends (optional)</Label>
            <Input
              id="event-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-colour">Colour</Label>
        <input
          id="event-colour"
          type="color"
          value={colour}
          onChange={(e) => setColour(e.target.value)}
          className="h-10 w-16 cursor-pointer rounded-control border border-line bg-surface"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-desc">Notes</Label>
        <Input
          id="event-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {(localError ?? error) && <p className="text-sm text-warning">{localError ?? error}</p>}

      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <Button type="button" variant="ghost" onClick={onDelete} className="text-warning">
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {event ? 'Save changes' : 'Add event'}
          </Button>
        </div>
      </div>
    </form>
  )
}
