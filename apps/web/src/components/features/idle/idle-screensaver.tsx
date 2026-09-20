import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { format } from 'date-fns'
import type { HaEntityState, IdleModeSettings } from '@hame/shared'
import { useIdlePhotos } from '@/api/idle'
import { useHaEntities } from '@/api/home-assistant'
import { useBins } from '@/api/bins'
import { useMealPlan } from '@/api/meal-plans'
import { useNotes } from '@/api/notes'
import { cn } from '@/lib/utils'
import {
  advanceScreensaver,
  initialScreensaverState,
  phaseDurationMs,
  type ScreensaverContext,
  type ScreensaverState,
} from './screensaver'
import { choosePhotoFit, type Size } from './photo-fit'
import { selectDueBins, selectSlotMeal } from './idle-info'
import { BinsScreen } from './bins-screen'
import { MealsScreen } from './meals-screen'
import { NotesScreen } from './notes-screen'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

/** Same-origin proxy URL for one Immich asset (spec §8.14 — creds stay server-side). */
function photoUrl(assetId: string): string {
  return `${API_BASE}/api/idle/photo/${encodeURIComponent(assetId)}`
}

/**
 * One photo layer that fades in once loaded; stacking two gives a crossfade.
 *
 * A photo whose shape is far from the frame's is shown whole over a blurred,
 * scaled copy of itself rather than cropped to fill (see `choosePhotoFit`) — the
 * digital-photo-frame treatment, which keeps the display edge-to-edge without
 * throwing away half a portrait shot. The fill is the same URL, so it is served
 * from the browser cache rather than costing a second trip through the proxy.
 *
 * The fit isn't known until the browser reports the photo's dimensions, but the
 * layer is transparent until exactly that moment, so nothing is ever painted at
 * the wrong fit.
 */
function FadeImage({ src, frame }: { src: string; frame: Size | null }) {
  const [natural, setNatural] = useState<Size | null>(null)
  const fit = natural && frame ? choosePhotoFit(natural, frame) : 'cover'
  return (
    <div
      className={cn(
        'absolute inset-0 transition-opacity duration-1000',
        natural ? 'opacity-100' : 'opacity-0',
      )}
    >
      {fit === 'contain' && (
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-75"
        />
      )}
      <img
        src={src}
        alt=""
        onLoad={(e) =>
          setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
        }
        className={cn(
          'absolute inset-0 h-full w-full',
          fit === 'cover' ? 'object-cover' : 'object-contain',
        )}
      />
    </div>
  )
}

/** Crossfade between photos: keep the last two layers, newest fading in on top. */
function PhotoStack({ assetId }: { assetId: string | null }) {
  const [layers, setLayers] = useState<{ id: string; key: number }[]>([])
  const keyRef = useRef(0)
  const [frame, frameRef] = useMeasuredSize()
  useEffect(() => {
    if (!assetId) return
    setLayers((prev) => [...prev, { id: assetId, key: keyRef.current++ }].slice(-2))
  }, [assetId])
  return (
    <div ref={frameRef} className="absolute inset-0">
      {layers.map((layer) => (
        <FadeImage key={layer.key} src={photoUrl(layer.id)} frame={frame} />
      ))}
    </div>
  )
}

/** The frame's own size, kept current so a rotated or resized display re-fits
 *  its photos rather than holding a decision made at a shape it no longer is. */
function useMeasuredSize(): [Size | null, (el: HTMLElement | null) => void] {
  const [size, setSize] = useState<Size | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const measure = useCallback((el: HTMLElement | null) => {
    observerRef.current?.disconnect()
    if (!el) return
    setSize({ width: el.clientWidth, height: el.clientHeight })
    observerRef.current = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observerRef.current.observe(el)
  }, [])
  useEffect(() => () => observerRef.current?.disconnect(), [])
  return [size, measure]
}

/** A coarse clock used only for the date line (the hands animate separately). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

const HOUR_MARKERS = Array.from({ length: 12 }, (_, i) => i)

/**
 * An analog clock whose second hand **sweeps smoothly** (no ticking): a
 * requestAnimationFrame loop rotates the hands from the current time — including
 * milliseconds — by writing the SVG `transform` attribute directly, so it
 * animates without re-rendering React each frame. Memoised so the date/weather
 * re-render doesn't disturb it.
 */
const AnalogClock = memo(function AnalogClock() {
  const hour = useRef<SVGGElement>(null)
  const minute = useRef<SVGGElement>(null)
  const second = useRef<SVGGElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const now = new Date()
      const s = now.getSeconds() + now.getMilliseconds() / 1000
      const m = now.getMinutes() + s / 60
      const h = (now.getHours() % 12) + m / 60
      // SVG's own rotate(angle cx cy) pins rotation to the clock centre — no
      // transform-box quirks, unlike a CSS transform.
      hour.current?.setAttribute('transform', `rotate(${h * 30} 100 100)`)
      minute.current?.setAttribute('transform', `rotate(${m * 6} 100 100)`)
      second.current?.setAttribute('transform', `rotate(${s * 6} 100 100)`)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg
      viewBox="0 0 200 200"
      className="h-[min(58vmin,520px)] w-[min(58vmin,520px)]"
      role="img"
      aria-label="Clock"
    >
      {HOUR_MARKERS.map((i) => (
        <line
          key={i}
          x1="100"
          y1="12"
          x2="100"
          y2="22"
          stroke="var(--ink)"
          strokeOpacity={i % 3 === 0 ? 0.55 : 0.28}
          strokeWidth={i % 3 === 0 ? 3 : 1.5}
          strokeLinecap="round"
          transform={`rotate(${i * 30} 100 100)`}
        />
      ))}
      <g ref={hour} transform="rotate(0 100 100)">
        <line
          x1="100"
          y1="104"
          x2="100"
          y2="56"
          stroke="var(--ink)"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </g>
      <g ref={minute} transform="rotate(0 100 100)">
        <line
          x1="100"
          y1="108"
          x2="100"
          y2="34"
          stroke="var(--ink)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <g ref={second} transform="rotate(0 100 100)">
        <line
          x1="100"
          y1="116"
          x2="100"
          y2="28"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <circle cx="100" cy="100" r="4.5" fill="var(--ink)" />
      <circle cx="100" cy="100" r="2" fill="var(--accent)" />
    </svg>
  )
})

function ClockFace({
  weather,
  showWeather,
}: {
  weather: HaEntityState | undefined
  showWeather: boolean
}) {
  const now = useNow()
  const temperature =
    typeof weather?.attributes.temperature === 'number' ? weather.attributes.temperature : null
  const unit =
    typeof weather?.attributes.temperature_unit === 'string'
      ? weather.attributes.temperature_unit
      : '°'

  return (
    <div className="flex flex-col items-center gap-6 text-center text-ink">
      <AnalogClock />
      <p className="font-serif text-3xl text-ink">{format(now, 'EEEE d MMMM')}</p>
      {showWeather && temperature !== null && (
        <p className="text-xl text-muted-foreground">
          {Math.round(temperature)}
          {unit}
          {weather?.state ? ` · ${weather.state.replace(/-/g, ' ')}` : ''}
        </p>
      )}
    </div>
  )
}

/**
 * The full-screen idle screensaver (spec §8.14): cycles Immich photos and a
 * large clock until touch wakes the dashboard. Mounted only while idle. Photos
 * fade between each other and over the black clock screen; with no photos
 * available it stays clock-only.
 */
export function IdleScreensaver({ settings }: { settings: IdleModeSettings }) {
  const { data: photos } = useIdlePhotos(settings.immichEnabled)
  // Disabling the query leaves its last result in the cache, so gate on the
  // setting too — photos off means an empty pool (clock-only), never stale photos.
  const pool = useMemo(
    () => (settings.immichEnabled ? (photos?.assetIds ?? []) : []),
    [photos, settings.immichEnabled],
  )

  // Weather is a cheap one-shot read of the cached HA entities (no SSE here);
  // only fetched when the clock screen actually wants it.
  const { data: entities } = useHaEntities(settings.showWeatherInClockMode)
  const weather = useMemo(() => entities?.find((e) => e.domain === 'weather'), [entities])

  // Info-screen data. A coarse `now` (30s tick) drives both the day/slot windows
  // and the clock's date line, so a slot or day rollover re-selects without a
  // reload. Selection is gated on the per-household toggles.
  const now = useNow()
  const { data: bins } = useBins()
  const today = format(now, 'yyyy-MM-dd')
  const { data: mealEntries } = useMealPlan(today, today)

  const dueBins = useMemo(
    () =>
      settings.showBinsInIdle ? selectDueBins(bins ?? [], now, settings.binDueCutoffMinutes) : null,
    [settings.showBinsInIdle, settings.binDueCutoffMinutes, bins, now],
  )
  const slotMeal = useMemo(
    () => (settings.showMealsInIdle ? selectSlotMeal(mealEntries ?? [], now) : null),
    [settings.showMealsInIdle, mealEntries, now],
  )

  // Household QuickNotes (spec §8.16) for the board screen, gated on the toggle.
  // The tablet account only ever receives household notes, but filter defensively
  // so a direct note could never reach the shared wall.
  const { data: allNotes } = useNotes()
  const householdNotes = useMemo(
    () =>
      settings.showNotesInIdle ? (allNotes ?? []).filter((n) => n.audience === 'HOUSEHOLD') : [],
    [settings.showNotesInIdle, allNotes],
  )

  // Availability fed into the state machine so it skips an empty info screen.
  const screenCtx: ScreensaverContext = {
    poolLength: pool.length,
    binsAvailable: dueBins !== null,
    mealAvailable: slotMeal !== null,
    notesAvailable: householdNotes.length > 0,
  }

  // The rotation state machine, driven by a single self-scheduling timer. The
  // reducer closes over the latest `screenCtx`, so each transition sees current
  // availability.
  const [state, dispatch] = useReducer(
    (prev: ScreensaverState) => advanceScreensaver(prev, screenCtx),
    pool.length,
    initialScreensaverState,
  )

  // Re-anchor when the pool first arrives (it loads after mount).
  const synced = useRef(false)
  useEffect(() => {
    if (!synced.current && pool.length > 0) {
      synced.current = true
      dispatch()
    }
  }, [pool.length])

  useEffect(() => {
    const id = setTimeout(() => dispatch(), phaseDurationMs(state, settings))
    return () => clearTimeout(id)
  }, [state, settings])

  const showPhoto = state.mode === 'photo' && pool.length > 0
  const assetId = showPhoto ? (pool[state.photoIndex % pool.length] ?? null) : null

  // The non-photo overlay for the current mode. Availability can flip between a
  // transition and this render, so an info screen falls back to the clock if its
  // data has just gone.
  let overlay: ReactNode = null
  if (!showPhoto) {
    if (state.mode === 'bins' && dueBins) {
      overlay = <BinsScreen due={dueBins} />
    } else if (state.mode === 'meals' && slotMeal) {
      overlay = <MealsScreen entry={slotMeal} />
    } else if (state.mode === 'notes' && householdNotes.length > 0) {
      overlay = <NotesScreen notes={householdNotes} />
    } else {
      overlay = (
        <div className="flex h-full w-full items-center justify-center bg-background">
          <ClockFace weather={weather} showWeather={settings.showWeatherInClockMode} />
        </div>
      )
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-background">
      <PhotoStack assetId={assetId} />
      {overlay && <div className="absolute inset-0">{overlay}</div>}
    </div>
  )
}
