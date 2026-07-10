import { useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarCog, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { parseISO } from 'date-fns'
import type { CalendarEvent, CalendarEventType, CreateCustomEventInput } from '@hame/shared'
import { EventForm, type EventFormInitial } from '@/components/features/calendar/event-form'
import { CalendarSourcesManager } from '@/components/features/calendar/calendar-sources-manager'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ApiError } from '@/api/client'
import { useCalendar } from '@/api/calendar'
import {
  useCreateCustomEvent,
  useDeleteCustomEvent,
  useUpdateCustomEvent,
} from '@/api/custom-events'
import { cn } from '@/lib/utils'

/** Default chip colour + legend label per event type (used when a row has no colour of its own). */
const TYPE_META: Record<CalendarEventType, { label: string; colour: string }> = {
  MEAL: { label: 'Meals', colour: '#6f8169' },
  CHORE: { label: 'Chores', colour: '#857a6c' },
  BIN: { label: 'Bins', colour: '#9aa0a6' },
  EVENT: { label: 'Events', colour: '#d16a6a' },
  SYNCED: { label: 'External', colour: '#2f6fb0' },
  INTEGRATION: { label: 'Integrations', colour: '#7a6ca8' },
}
const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Calendar-day bucket key. All-day rows are UTC-midnight, so slice the ISO date to avoid a TZ shift. */
function eventDayKey(event: CalendarEvent): string {
  const iso = typeof event.startTime === 'string' ? event.startTime : event.startTime.toISOString()
  return event.allDay ? iso.slice(0, 10) : format(new Date(iso), 'yyyy-MM-dd')
}

function eventColour(event: CalendarEvent): string {
  return event.colour ?? TYPE_META[event.type].colour
}

/** Short time label for the day-detail list ("All day" or e.g. "18:30"). */
function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'All day'
  const iso = typeof event.startTime === 'string' ? event.startTime : event.startTime.toISOString()
  return format(new Date(iso), 'HH:mm')
}

type Editing =
  | { mode: 'create'; date: string }
  | { mode: 'edit'; sourceId: string; initial: EventFormInitial }

export function CalendarPage() {
  const [monthOffset, setMonthOffset] = useState(0)
  const monthAnchor = useMemo(() => addMonths(new Date(), monthOffset), [monthOffset])
  const gridStart = useMemo(
    () => startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 }),
    [monthAnchor],
  )
  const gridEnd = useMemo(
    () => endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 1 }),
    [monthAnchor],
  )
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  )

  const { data: events } = useCalendar(
    format(gridStart, 'yyyy-MM-dd'),
    format(gridEnd, 'yyyy-MM-dd'),
  )

  const createEvent = useCreateCustomEvent()
  const updateEvent = useUpdateCustomEvent()
  const deleteEvent = useDeleteCustomEvent()

  const [editing, setEditing] = useState<Editing | null>(null)
  const [dayDetail, setDayDetail] = useState<string | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events ?? []) {
      const key = eventDayKey(event)
      const list = map.get(key)
      if (list) list.push(event)
      else map.set(key, [event])
    }
    return map
  }, [events])

  function openCreate(date: string) {
    setError(null)
    setDayDetail(null)
    setEditing({ mode: 'create', date })
  }

  function openEvent(event: CalendarEvent) {
    if (event.type !== 'EVENT') return // only custom events are editable here
    setError(null)
    setDayDetail(null)
    setEditing({
      mode: 'edit',
      sourceId: event.sourceId,
      initial: {
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        allDay: event.allDay,
        colour: event.colour,
      },
    })
  }

  async function handleSubmit(input: CreateCustomEventInput) {
    setError(null)
    try {
      if (editing?.mode === 'edit')
        await updateEvent.mutateAsync({ id: editing.sourceId, ...input })
      else await createEvent.mutateAsync(input)
      setEditing(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the event.')
    }
  }

  async function handleDelete() {
    if (editing?.mode !== 'edit') return
    await deleteEvent.mutateAsync(editing.sourceId)
    setEditing(null)
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Calendar</h1>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-start">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonthOffset((m) => m - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-44 text-center font-serif text-xl text-ink">
            {format(monthAnchor, 'MMMM yyyy')}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setMonthOffset((m) => m + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          {monthOffset !== 0 && (
            <Button variant="ghost" onClick={() => setMonthOffset(0)}>
              Today
            </Button>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center justify-center gap-3 sm:w-auto sm:justify-start">
          {Object.values(TYPE_META).map((meta) => (
            <span
              key={meta.label}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.colour }} />
              {meta.label}
            </span>
          ))}
          <Button variant="outline" onClick={() => setSourcesOpen(true)}>
            <CalendarCog className="size-4" />
            Calendars
          </Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px text-center text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {WEEKDAY_HEADERS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd')
          const dayEvents = byDay.get(dayKey) ?? []
          const inMonth = isSameMonth(day, monthAnchor)
          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => {
                setError(null)
                setDayDetail(dayKey)
              }}
              aria-label={`${format(day, 'EEEE d MMMM')}${dayEvents.length ? `, ${dayEvents.length} events` : ''}`}
              className={cn(
                'group flex min-h-20 flex-col gap-1 rounded-card border border-line bg-surface p-1.5 text-left transition-colors hover:border-accent sm:min-h-28 sm:p-2',
                !inMonth && 'opacity-50',
                isToday(day) && 'border-accent',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn('text-sm font-semibold', isToday(day) ? 'text-accent' : 'text-ink')}
                >
                  {format(day, 'd')}
                </span>
                <Plus className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="flex flex-col gap-1">
                {dayEvents.map((event) => (
                  <span
                    key={event.id}
                    title={event.title}
                    className="flex items-center gap-1 rounded-control px-1 py-0.5 text-xs text-ink sm:gap-1.5 sm:px-1.5"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: eventColour(event) }}
                    />
                    <span className="truncate">{event.title}</span>
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      <Modal
        open={dayDetail !== null}
        onClose={() => setDayDetail(null)}
        title={dayDetail ? format(parseISO(dayDetail), 'EEEE d MMMM') : ''}
      >
        {dayDetail && (
          <div className="flex flex-col gap-3">
            {(byDay.get(dayDetail) ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {(byDay.get(dayDetail) ?? []).map((event) => {
                  const editable = event.type === 'EVENT'
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => editable && openEvent(event)}
                        disabled={!editable}
                        className={cn(
                          'flex w-full items-center gap-3 py-2.5 text-left',
                          editable && 'rounded-control hover:bg-muted',
                        )}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: eventColour(event) }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {event.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {eventTimeLabel(event)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button variant="outline" className="self-start" onClick={() => openCreate(dayDetail)}>
              <Plus className="size-4" />
              Add event
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'edit' ? 'Edit event' : 'Add event'}
      >
        {editing && (
          <EventForm
            event={editing.mode === 'edit' ? editing.initial : undefined}
            defaultDate={editing.mode === 'create' ? editing.date : undefined}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
            onDelete={editing.mode === 'edit' ? () => void handleDelete() : undefined}
            submitting={createEvent.isPending || updateEvent.isPending}
            error={error}
          />
        )}
      </Modal>

      <Modal open={sourcesOpen} onClose={() => setSourcesOpen(false)} title="External calendars">
        <CalendarSourcesManager />
      </Modal>
    </main>
  )
}
