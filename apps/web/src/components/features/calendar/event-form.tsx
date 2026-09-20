import { useState } from 'react'
import type { BinRecurrenceType, CreateCustomEventInput, Weekday } from '@hame/shared'
import { BIN_RECURRENCE_TYPES, WEEKDAYS } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** The subset of a custom event the form needs to prefill. */
export interface EventFormInitial {
  title: string
  startTime: Date | string
  endTime: Date | string | null
  allDay: boolean
  colour: string | null
  description?: string | null
  recurrenceType?: BinRecurrenceType | null
  intervalDays?: number | null
  weekdays?: Weekday[]
  dayOfMonth?: number | null
}

/** The recurrence dropdown's own state — "doesn't repeat" plus the three engine types. */
type RecurrenceChoice = 'NONE' | BinRecurrenceType

const RECURRENCE_LABEL: Record<RecurrenceChoice, string> = {
  NONE: "Doesn't repeat",
  INTERVAL: 'Every N days',
  WEEKLY: 'Weekly',
  DATE_OF_MONTH: 'Day of month',
}
const WEEKDAY_LABEL: Record<Weekday, string> = {
  MONDAY: 'M',
  TUESDAY: 'T',
  WEDNESDAY: 'W',
  THURSDAY: 'T',
  FRIDAY: 'F',
  SATURDAY: 'S',
  SUNDAY: 'S',
}
const selectClass = 'h-10 rounded-control border border-input bg-surface px-2 text-sm text-ink'

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
  const [recurrence, setRecurrence] = useState<RecurrenceChoice>(event?.recurrenceType ?? 'NONE')
  const [intervalDays, setIntervalDays] = useState(String(event?.intervalDays ?? 7))
  const [weekdays, setWeekdays] = useState<Set<Weekday>>(new Set(event?.weekdays ?? []))
  const [dayOfMonth, setDayOfMonth] = useState(String(event?.dayOfMonth ?? 1))
  const [localError, setLocalError] = useState<string | null>(null)

  function toggleWeekday(day: Weekday) {
    setWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

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
    if (recurrence === 'INTERVAL' && !(Number(intervalDays) > 0))
      return setLocalError('Interval must be at least one day.')
    if (recurrence === 'WEEKLY' && weekdays.size === 0)
      return setLocalError('Pick at least one weekday.')

    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      startTime,
      endTime,
      allDay,
      colour,
      recurrenceType: recurrence === 'NONE' ? null : recurrence,
      intervalDays: recurrence === 'INTERVAL' ? Number(intervalDays) : null,
      weekdays: recurrence === 'WEEKLY' ? [...weekdays] : [],
      dayOfMonth: recurrence === 'DATE_OF_MONTH' ? Number(dayOfMonth) : null,
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
        <Label htmlFor="event-recurrence">Repeats</Label>
        <select
          id="event-recurrence"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as RecurrenceChoice)}
          className={cn(selectClass, 'w-48')}
        >
          {(['NONE', ...BIN_RECURRENCE_TYPES] as const).map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      {recurrence === 'INTERVAL' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-interval">Every (days)</Label>
          <Input
            id="event-interval"
            type="number"
            min="1"
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            className="w-28"
          />
        </div>
      )}

      {recurrence === 'WEEKLY' && (
        <div className="flex flex-col gap-1.5">
          <Label>On days</Label>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleWeekday(day)}
                aria-pressed={weekdays.has(day)}
                aria-label={day}
                className={cn(
                  'size-9 rounded-pill border text-sm font-medium transition-colors',
                  weekdays.has(day)
                    ? 'border-accent bg-accent text-white'
                    : 'border-line bg-surface text-muted-foreground hover:border-accent',
                )}
              >
                {WEEKDAY_LABEL[day]}
              </button>
            ))}
          </div>
        </div>
      )}

      {recurrence === 'DATE_OF_MONTH' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-dom">Day of month</Label>
          <Input
            id="event-dom"
            type="number"
            min="1"
            max="31"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className="w-28"
          />
          <p className="text-xs text-muted-foreground">
            29–31 fall back to the month&apos;s last day.
          </p>
        </div>
      )}

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
