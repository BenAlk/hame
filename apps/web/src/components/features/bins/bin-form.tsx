import { useState } from 'react'
import type { BinCollection, BinRecurrenceType, CreateBinInput, Weekday } from '@hame/shared'
import { BIN_RECURRENCE_TYPES, WEEKDAYS } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const RECURRENCE_LABEL: Record<BinRecurrenceType, string> = {
  INTERVAL: 'Every N days (fortnightly, 4-weekly…)',
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

interface BinFormProps {
  bin?: BinCollection
  onSubmit: (input: CreateBinInput) => void
  onCancel: () => void
  submitting?: boolean
  error?: string | null
}

function isoDate(date: Date | string): string {
  return (typeof date === 'string' ? date : date.toISOString()).slice(0, 10)
}

/** Create/edit form for a bin collection schedule (spec §8.9). */
export function BinForm({ bin, onSubmit, onCancel, submitting, error }: BinFormProps) {
  const [name, setName] = useState(bin?.name ?? '')
  const [colour, setColour] = useState(bin?.colour ?? '#7d2b3e')
  const [recurrenceType, setRecurrenceType] = useState<BinRecurrenceType>(
    bin?.recurrenceType ?? 'WEEKLY',
  )
  const [intervalDays, setIntervalDays] = useState(String(bin?.intervalDays ?? 14))
  const [weekdays, setWeekdays] = useState<Set<Weekday>>(new Set(bin?.weekdays ?? ['TUESDAY']))
  const [dayOfMonth, setDayOfMonth] = useState(String(bin?.dayOfMonth ?? 1))
  const [startDate, setStartDate] = useState(bin?.startDate ? isoDate(bin.startDate) : '')
  const [remindNightBefore, setRemindNightBefore] = useState(bin?.remindNightBefore ?? true)
  const [remindMorningOf, setRemindMorningOf] = useState(bin?.remindMorningOf ?? true)
  const [localError, setLocalError] = useState<string | null>(null)

  function toggleDay(day: Weekday) {
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
    if (!name.trim()) return setLocalError('Give the bin a name.')
    if (recurrenceType === 'INTERVAL') {
      if (!(Number(intervalDays) > 0)) return setLocalError('Interval must be at least one day.')
      if (!startDate) return setLocalError('Pick a known past collection date to anchor the cycle.')
    }
    if (recurrenceType === 'WEEKLY' && weekdays.size === 0)
      return setLocalError('Pick at least one weekday.')

    onSubmit({
      name: name.trim(),
      colour,
      recurrenceType,
      intervalDays: recurrenceType === 'INTERVAL' ? Number(intervalDays) : null,
      weekdays: recurrenceType === 'WEEKLY' ? [...weekdays] : [],
      dayOfMonth: recurrenceType === 'DATE_OF_MONTH' ? Number(dayOfMonth) : null,
      startDate: recurrenceType === 'INTERVAL' && startDate ? new Date(startDate) : null,
      remindNightBefore,
      remindMorningOf,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="bin-name">Name</Label>
          <Input
            id="bin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Burgundy bin"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bin-colour">Colour</Label>
          <input
            id="bin-colour"
            type="color"
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded-control border border-line bg-surface"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bin-recurrence">Repeats</Label>
        <select
          id="bin-recurrence"
          value={recurrenceType}
          onChange={(e) => setRecurrenceType(e.target.value as BinRecurrenceType)}
          className={selectClass}
        >
          {BIN_RECURRENCE_TYPES.map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      {recurrenceType === 'INTERVAL' && (
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bin-interval">Every (days)</Label>
            <Input
              id="bin-interval"
              type="number"
              min="1"
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bin-anchor">A known collection date</Label>
            <Input
              id="bin-anchor"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-44"
            />
            <p className="text-xs text-muted-foreground">Anchors the cycle to the right weeks.</p>
          </div>
        </div>
      )}

      {recurrenceType === 'WEEKLY' && (
        <div className="flex flex-col gap-1.5">
          <Label>On days</Label>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
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

      {recurrenceType === 'DATE_OF_MONTH' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bin-dom">Day of month</Label>
          <Input
            id="bin-dom"
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

      <div className="flex flex-col gap-2">
        <Label>Reminders</Label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={remindNightBefore}
            onChange={(e) => setRemindNightBefore(e.target.checked)}
            className="size-4 accent-accent"
          />
          The night before
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={remindMorningOf}
            onChange={(e) => setRemindMorningOf(e.target.checked)}
            className="size-4 accent-accent"
          />
          The morning of
        </label>
      </div>

      {(localError ?? error) && <p className="text-sm text-warning">{localError ?? error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {bin ? 'Save changes' : 'Create bin'}
        </Button>
      </div>
    </form>
  )
}
