import { useState } from 'react'
import type {
  AssignmentMode,
  Chore,
  CreateChoreInput,
  MemberSummary,
  Pet,
  RecurrenceType,
  Weekday,
} from '@hame/shared'
import { ASSIGNMENT_MODES, RECURRENCE_TYPES, WEEKDAYS } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const RECURRENCE_LABEL: Record<RecurrenceType, string> = {
  INTERVAL: 'Every N days',
  WEEKLY: 'Weekly',
  DATE_OF_MONTH: 'Day of month',
  ONE_OFF: 'One-off',
}
const ASSIGNMENT_LABEL: Record<AssignmentMode, string> = {
  FIXED: 'Fixed person',
  ROTATING: 'Rotating',
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

interface ChoreFormProps {
  chore?: Chore
  users: MemberSummary[]
  pets: Pet[]
  onSubmit: (input: CreateChoreInput) => void
  onCancel: () => void
  submitting?: boolean
  error?: string | null
}

function isoDate(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10)
}

/** Create/edit form for a chore, swapping inputs by recurrence + assignment mode. */
export function ChoreForm({
  chore,
  users,
  pets,
  onSubmit,
  onCancel,
  submitting,
  error,
}: ChoreFormProps) {
  const [title, setTitle] = useState(chore?.title ?? '')
  const [description, setDescription] = useState(chore?.description ?? '')
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    chore?.recurrenceType ?? 'INTERVAL',
  )
  const [intervalDays, setIntervalDays] = useState(String(chore?.intervalDays ?? 7))
  const [weekdays, setWeekdays] = useState<Set<Weekday>>(new Set(chore?.weekdays ?? []))
  const [dayOfMonth, setDayOfMonth] = useState(String(chore?.dayOfMonth ?? 1))
  const [oneOffDate, setOneOffDate] = useState(chore?.oneOffDate ? isoDate(chore.oneOffDate) : '')
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>(
    chore?.assignmentMode ?? 'FIXED',
  )
  const [assignedToId, setAssignedToId] = useState(chore?.assignedTo?.id ?? users[0]?.id ?? '')
  const [rotating, setRotating] = useState<Set<string>>(
    new Set(chore?.rotatingUsers.map((u) => u.id) ?? []),
  )
  const [petId, setPetId] = useState(chore?.pet?.id ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!title.trim()) return setLocalError('Give the chore a title.')
    if (recurrenceType === 'INTERVAL' && !(Number(intervalDays) > 0))
      return setLocalError('Interval must be at least one day.')
    if (recurrenceType === 'WEEKLY' && weekdays.size === 0)
      return setLocalError('Pick at least one weekday.')
    if (recurrenceType === 'ONE_OFF' && !oneOffDate) return setLocalError('Choose a date.')
    if (assignmentMode === 'FIXED' && !assignedToId) return setLocalError('Assign this chore.')
    if (assignmentMode === 'ROTATING' && rotating.size < 2)
      return setLocalError('Rotating chores need at least two people.')

    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      recurrenceType,
      intervalDays: recurrenceType === 'INTERVAL' ? Number(intervalDays) : null,
      weekdays: recurrenceType === 'WEEKLY' ? [...weekdays] : [],
      dayOfMonth: recurrenceType === 'DATE_OF_MONTH' ? Number(dayOfMonth) : null,
      oneOffDate: recurrenceType === 'ONE_OFF' && oneOffDate ? new Date(oneOffDate) : null,
      assignmentMode,
      assignedToId: assignmentMode === 'FIXED' ? assignedToId || null : null,
      rotatingUsers: assignmentMode === 'ROTATING' ? [...rotating] : [],
      petId: petId || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="chore-title">Title</Label>
        <Input
          id="chore-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Hoover downstairs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="chore-desc">Description</Label>
        <Input
          id="chore-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {/* Recurrence */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="chore-recurrence">Repeats</Label>
        <select
          id="chore-recurrence"
          value={recurrenceType}
          onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
          className={selectClass}
        >
          {RECURRENCE_TYPES.map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      {recurrenceType === 'INTERVAL' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="chore-interval">Every (days)</Label>
          <Input
            id="chore-interval"
            type="number"
            min="1"
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            className="w-28"
          />
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
                onClick={() => setWeekdays((s) => toggle(s, day))}
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
          <Label htmlFor="chore-dom">Day of month</Label>
          <Input
            id="chore-dom"
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

      {recurrenceType === 'ONE_OFF' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="chore-oneoff">Date</Label>
          <Input
            id="chore-oneoff"
            type="date"
            value={oneOffDate}
            onChange={(e) => setOneOffDate(e.target.value)}
            className="w-44"
          />
        </div>
      )}

      {/* Assignment */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="chore-assignment">Assignment</Label>
        <select
          id="chore-assignment"
          value={assignmentMode}
          onChange={(e) => setAssignmentMode(e.target.value as AssignmentMode)}
          className={selectClass}
        >
          {ASSIGNMENT_MODES.map((m) => (
            <option key={m} value={m}>
              {ASSIGNMENT_LABEL[m]}
            </option>
          ))}
        </select>
      </div>

      {assignmentMode === 'FIXED' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="chore-assignee">Assigned to</Label>
          <select
            id="chore-assignee"
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            className={selectClass}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label>Rotate between</Label>
          <div className="flex flex-wrap gap-1.5">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setRotating((s) => toggle(s, u.id))}
                aria-pressed={rotating.has(u.id)}
                className={cn(
                  'rounded-pill border px-3 py-1.5 text-sm font-medium transition-colors',
                  rotating.has(u.id)
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-muted-foreground hover:border-accent',
                )}
              >
                {u.firstName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pet link */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="chore-pet">Pet (optional)</Label>
        <select
          id="chore-pet"
          value={petId}
          onChange={(e) => setPetId(e.target.value)}
          className={selectClass}
        >
          <option value="">No pet</option>
          {pets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {(localError ?? error) && <p className="text-sm text-warning">{localError ?? error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {chore ? 'Save changes' : 'Create chore'}
        </Button>
      </div>
    </form>
  )
}
