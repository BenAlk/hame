import { useEffect, useState } from 'react'
import type {
  BinCollection,
  BinRecurrenceType,
  CreateBinInput,
  CreateScraperBinsInput,
  Weekday,
} from '@hame/shared'
import { BIN_RECURRENCE_TYPES, WEEKDAYS } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ApiError } from '@/api/client'
import { useAddressBins, useScraperCouncils, useSearchAddresses } from '@/api/bins'

/** A UK-postcode-shaped string, used only to nudge when a council is street-only. */
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i

/** Default bin colours, keyed by the scraper's normalised colour key. */
const BIN_COLOURS: Record<string, string> = {
  burgundy: '#7d2b3e',
  'black/green': '#2f3b34',
  blue: '#2f5fa6',
  'light grey': '#9aa3ab',
  grey: '#9aa3ab',
  brown: '#6b5d4f',
  green: '#3f7a3f',
  'waste sacks': '#b08d57',
}

/** A sensible colour for a scraped bin, matched from its name. */
function colourForKey(key: string): string {
  if (BIN_COLOURS[key]) return BIN_COLOURS[key]
  const hit = Object.keys(BIN_COLOURS).find((k) => key.includes(k) || k.includes(key))
  return hit ? BIN_COLOURS[hit] : '#7d2b3e'
}

/** Title-case a colour key for a default bin name ("black/green" → "Black/Green"). */
function prettifyKey(key: string): string {
  return key.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Editable, per-bin selection state in the "add all my bins" flow. */
interface BinChoice {
  selected: boolean
  name: string
  colour: string
}

/** Source types this form can author. Home Assistant lands with Phase 6; the
 * other three (typed schedule, iCal feed, council scraper) ship now (spec §10
 * Phase 5.6). */
type FormSource = 'MANUAL' | 'ICAL' | 'SCRAPER'

const SOURCE_LABEL: Record<FormSource, string> = {
  MANUAL: 'A schedule I type in',
  ICAL: 'A council iCal feed',
  SCRAPER: "My council's website",
}

function initialSource(bin?: BinCollection): FormSource {
  return bin?.sourceType === 'ICAL' || bin?.sourceType === 'SCRAPER' ? bin.sourceType : 'MANUAL'
}

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
  /** Bulk-create every chosen bin for a scraped address (creation only). */
  onSubmitBatch?: (input: CreateScraperBinsInput) => void
  onCancel: () => void
  submitting?: boolean
  error?: string | null
}

function isoDate(date: Date | string): string {
  return (typeof date === 'string' ? date : date.toISOString()).slice(0, 10)
}

/** Create/edit form for a bin collection schedule (spec §8.9). */
export function BinForm({
  bin,
  onSubmit,
  onSubmitBatch,
  onCancel,
  submitting,
  error,
}: BinFormProps) {
  const [name, setName] = useState(bin?.name ?? '')
  const [colour, setColour] = useState(bin?.colour ?? '#7d2b3e')
  const [source, setSource] = useState<FormSource>(initialSource(bin))
  const [feedUrl, setFeedUrl] = useState(bin?.sourceConfig?.url ?? '')
  const [matchKey, setMatchKey] = useState(bin?.sourceConfig?.matchKey ?? '')
  // Scraper source: council + a resolved address from the council's lookup.
  const [councilId, setCouncilId] = useState(bin?.sourceConfig?.councilId ?? '')
  const [addressId, setAddressId] = useState(bin?.sourceConfig?.addressId ?? '')
  const [addressQuery, setAddressQuery] = useState('')
  const councils = useScraperCouncils(source === 'SCRAPER')
  const addressSearch = useSearchAddresses()
  const effectiveCouncilId = councilId || councils.data?.[0]?.id || ''
  const selectedCouncil = councils.data?.find((c) => c.id === effectiveCouncilId)
  const addressBins = useAddressBins(source === 'SCRAPER' ? effectiveCouncilId : '', addressId)
  // Bulk create: every bin at the address, name + auto-colour, deselectable.
  const isScraperBulk = source === 'SCRAPER' && !bin
  const [choices, setChoices] = useState<Record<string, BinChoice>>({})
  useEffect(() => {
    if (!isScraperBulk || !addressBins.data) return
    setChoices(
      Object.fromEntries(
        addressBins.data.map((b) => [
          b.key,
          { selected: true, name: prettifyKey(b.key), colour: colourForKey(b.key) },
        ]),
      ),
    )
  }, [addressBins.data, isScraperBulk])
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

  async function handleAddressSearch() {
    setLocalError(null)
    setAddressId('')
    setMatchKey('')
    if (addressQuery.trim().length < 2) return setLocalError('Type a street name to search.')
    try {
      await addressSearch.mutateAsync({ councilId: effectiveCouncilId, q: addressQuery.trim() })
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.message : 'Could not search the council site.')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)

    // Bulk: create every selected bin at the scraped address in one call.
    if (isScraperBulk) {
      if (!effectiveCouncilId) return setLocalError('Pick your council.')
      if (!addressId) return setLocalError('Search for and select your address.')
      const chosen = Object.entries(choices).filter(([, c]) => c.selected)
      if (chosen.length === 0) return setLocalError('Select at least one bin to add.')
      if (chosen.some(([, c]) => !c.name.trim()))
        return setLocalError('Give every selected bin a name.')
      onSubmitBatch?.({
        councilId: effectiveCouncilId,
        addressId,
        remindNightBefore,
        remindMorningOf,
        bins: chosen.map(([key, c]) => ({ key, name: c.name.trim(), colour: c.colour })),
      })
      return
    }

    if (!name.trim()) return setLocalError('Give the bin a name.')

    const common = { name: name.trim(), colour, remindNightBefore, remindMorningOf }

    // An iCal bin gets its dates from the feed, not a typed schedule (spec §8.9).
    // The council/scraper and Home Assistant sources land later behind the same
    // model (spec §10 Phase 5.6).
    if (source === 'ICAL') {
      if (!feedUrl.trim()) return setLocalError('Paste the council iCal feed URL.')
      onSubmit({
        ...common,
        sourceType: 'ICAL',
        sourceConfig: {
          url: feedUrl.trim(),
          ...(matchKey.trim() && { matchKey: matchKey.trim() }),
        },
        recurrenceType: null,
        weekdays: [],
      })
      return
    }

    // A scraper bin reads this household's address on the council's own site and
    // projects dates forward (spec §8.9, §12). matchKey picks this colour's bin.
    if (source === 'SCRAPER') {
      if (!effectiveCouncilId) return setLocalError('Pick your council.')
      if (!addressId) return setLocalError('Search for and select your address.')
      if (!matchKey.trim()) return setLocalError('Enter which bin this is (e.g. Burgundy).')
      onSubmit({
        ...common,
        sourceType: 'SCRAPER',
        sourceConfig: {
          councilId: effectiveCouncilId,
          addressId,
          matchKey: matchKey.trim(),
        },
        recurrenceType: null,
        weekdays: [],
      })
      return
    }

    if (recurrenceType === 'INTERVAL') {
      if (!(Number(intervalDays) > 0)) return setLocalError('Interval must be at least one day.')
      if (!startDate) return setLocalError('Pick a known past collection date to anchor the cycle.')
    }
    if (recurrenceType === 'WEEKLY' && weekdays.size === 0)
      return setLocalError('Pick at least one weekday.')

    onSubmit({
      ...common,
      sourceType: 'MANUAL',
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
      {/* In bulk mode each bin carries its own name + colour below. */}
      {!isScraperBulk && (
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
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bin-source">Collection dates come from</Label>
        <select
          id="bin-source"
          value={source}
          onChange={(e) => setSource(e.target.value as FormSource)}
          className={selectClass}
        >
          {(Object.keys(SOURCE_LABEL) as FormSource[]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {source === 'ICAL' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bin-feed">iCal feed URL</Label>
            <Input
              id="bin-feed"
              type="url"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://council.example/collections.ics"
            />
            <p className="text-xs text-muted-foreground">
              Hame syncs this feed and keeps the dates correct, bank-holiday shifts included.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bin-matchkey">Match events containing (optional)</Label>
            <Input
              id="bin-matchkey"
              value={matchKey}
              onChange={(e) => setMatchKey(e.target.value)}
              placeholder="e.g. Burgundy"
            />
            <p className="text-xs text-muted-foreground">
              If one feed lists every bin, this picks the events for this colour. Leave blank to
              take them all.
            </p>
          </div>
        </div>
      )}

      {source === 'SCRAPER' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bin-council">Council</Label>
            <select
              id="bin-council"
              value={effectiveCouncilId}
              onChange={(e) => {
                setCouncilId(e.target.value)
                setAddressId('')
                setMatchKey('')
              }}
              className={selectClass}
              disabled={councils.isPending}
            >
              {councils.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {councils.data && councils.data.length === 0 && (
              <p className="text-xs text-warning">No councils are supported yet.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bin-address">Your address</Label>
            <div className="flex gap-2">
              <Input
                id="bin-address"
                value={addressQuery}
                onChange={(e) => setAddressQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleAddressSearch()
                  }
                }}
                placeholder="Street name, e.g. Argyle Street"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleAddressSearch()}
                disabled={addressSearch.isPending || !effectiveCouncilId}
              >
                {addressSearch.isPending ? 'Searching…' : 'Search'}
              </Button>
            </div>
            {selectedCouncil && (
              <p className="text-xs text-muted-foreground">{selectedCouncil.searchHint}</p>
            )}
            {POSTCODE_RE.test(addressQuery.trim()) && (
              <p className="text-xs text-warning">
                That looks like a postcode — search by street name instead.
              </p>
            )}
            {addressSearch.data &&
              (addressSearch.data.length ? (
                <select
                  aria-label="Matching addresses"
                  value={addressId}
                  onChange={(e) => {
                    setAddressId(e.target.value)
                    setMatchKey('')
                  }}
                  className={selectClass}
                >
                  <option value="" disabled>
                    Select your address…
                  </option>
                  {addressSearch.data.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground">No matches — try another street.</p>
              ))}
          </div>

          {/* Editing one bin: pick which council bin it maps to. */}
          {!isScraperBulk && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bin-scraper-match">Which bin</Label>
              <select
                id="bin-scraper-match"
                value={matchKey}
                onChange={(e) => setMatchKey(e.target.value)}
                className={selectClass}
                disabled={!addressId || addressBins.isPending || !addressBins.data?.length}
              >
                <option value="" disabled>
                  {!addressId
                    ? 'Select your address first'
                    : addressBins.isPending
                      ? 'Loading bins…'
                      : addressBins.isError
                        ? 'Could not read the bins'
                        : 'Select a bin…'}
                </option>
                {addressBins.data?.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.name}
                  </option>
                ))}
              </select>
              {addressBins.isError && (
                <p className="text-xs text-warning">
                  Couldn’t read this address’s bins — re-select your address and try again.
                </p>
              )}
            </div>
          )}

          {/* Creating: every bin at the address, named + auto-coloured, deselectable. */}
          {isScraperBulk && addressId && (
            <div className="flex flex-col gap-2">
              <Label>Bins at this address</Label>
              {addressBins.isPending && (
                <p className="text-sm text-muted-foreground">Reading your bins…</p>
              )}
              {addressBins.isError && (
                <p className="text-sm text-warning">
                  Couldn’t read this address’s bins — re-select your address and try again.
                </p>
              )}
              {addressBins.data?.map((b) => {
                const choice = choices[b.key]
                if (!choice) return null
                return (
                  <div key={b.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Add ${b.name}`}
                      checked={choice.selected}
                      onChange={(e) =>
                        setChoices((prev) => ({
                          ...prev,
                          [b.key]: { ...prev[b.key], selected: e.target.checked },
                        }))
                      }
                      className="size-4 accent-accent"
                    />
                    <input
                      type="color"
                      aria-label={`${b.name} colour`}
                      value={choice.colour}
                      onChange={(e) =>
                        setChoices((prev) => ({
                          ...prev,
                          [b.key]: { ...prev[b.key], colour: e.target.value },
                        }))
                      }
                      className="size-8 shrink-0 cursor-pointer rounded-control border border-line bg-surface"
                    />
                    <Input
                      aria-label={`${b.name} name`}
                      value={choice.name}
                      onChange={(e) =>
                        setChoices((prev) => ({
                          ...prev,
                          [b.key]: { ...prev[b.key], name: e.target.value },
                        }))
                      }
                      disabled={!choice.selected}
                      className="flex-1"
                    />
                    <span className="hidden w-40 shrink-0 truncate text-xs text-muted-foreground sm:block">
                      {b.name}
                    </span>
                  </div>
                )
              })}
              {addressBins.data?.length ? (
                <p className="text-xs text-muted-foreground">
                  Colours are matched from each bin’s name — tweak any you like. Hame keeps the
                  dates correct, bank-holiday shifts included.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {source === 'MANUAL' && (
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
      )}

      {source === 'MANUAL' && recurrenceType === 'INTERVAL' && (
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

      {source === 'MANUAL' && recurrenceType === 'WEEKLY' && (
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

      {source === 'MANUAL' && recurrenceType === 'DATE_OF_MONTH' && (
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
          {isScraperBulk
            ? `Add ${Object.values(choices).filter((c) => c.selected).length || ''} ${
                Object.values(choices).filter((c) => c.selected).length === 1 ? 'bin' : 'bins'
              }`.trim()
            : bin
              ? 'Save changes'
              : 'Create bin'}
        </Button>
      </div>
    </form>
  )
}
