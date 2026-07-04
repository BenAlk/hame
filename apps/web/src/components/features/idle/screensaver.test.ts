import { describe, it, expect } from 'vitest'
import type { IdleModeSettings } from '@hame/shared'
import {
  advanceScreensaver,
  BINS_DISPLAY_SECONDS,
  initialScreensaverState,
  MEALS_DISPLAY_SECONDS,
  PHOTOS_PER_RUN,
  phaseDurationMs,
  type ScreensaverContext,
  type ScreensaverState,
} from './screensaver'

const settings: IdleModeSettings = {
  enabled: true,
  activationMinutes: 5,
  photoDisplaySeconds: 30,
  clockDisplaySeconds: 120,
  shufflePhotos: true,
  showWeatherInClockMode: true,
  immichEnabled: true,
  showBinsInIdle: true,
  showMealsInIdle: true,
  updatedAt: new Date(),
}

/** Context builder — photos present, no info screens, unless overridden. */
const ctx = (over: Partial<ScreensaverContext> = {}): ScreensaverContext => ({
  poolLength: 20,
  binsAvailable: false,
  mealAvailable: false,
  ...over,
})

describe('initialScreensaverState', () => {
  it('starts on a photo when the pool has any', () => {
    expect(initialScreensaverState(10)).toEqual({ mode: 'photo', photoIndex: 0, shownInRun: 1 })
  })

  it('starts on the clock when there are no photos', () => {
    expect(initialScreensaverState(0)).toEqual({ mode: 'clock', photoIndex: 0, shownInRun: 0 })
  })
})

describe('advanceScreensaver', () => {
  it('cycles through photos then hands over to the clock after a run', () => {
    let state = initialScreensaverState(20)
    const seen: number[] = [state.photoIndex]
    for (let i = 1; i < PHOTOS_PER_RUN; i++) {
      state = advanceScreensaver(state, ctx())
      expect(state.mode).toBe('photo')
      seen.push(state.photoIndex)
    }
    expect(seen).toEqual([0, 1, 2, 3, 4])
    // After PHOTOS_PER_RUN photos, the clock takes over.
    state = advanceScreensaver(state, ctx())
    expect(state.mode).toBe('clock')
  })

  it('returns from the clock to the next photo when no info screens are due', () => {
    const clock: ScreensaverState = { mode: 'clock', photoIndex: 4, shownInRun: 0 }
    const next = advanceScreensaver(clock, ctx())
    expect(next).toEqual({ mode: 'photo', photoIndex: 5, shownInRun: 1 })
  })

  it('wraps the photo index around the pool', () => {
    const last: ScreensaverState = { mode: 'clock', photoIndex: 19, shownInRun: 0 }
    expect(advanceScreensaver(last, ctx()).photoIndex).toBe(0)
  })

  it('ends the run early for a pool smaller than a full run', () => {
    let state = initialScreensaverState(2) // photo 0 shown (shownInRun = 1)
    state = advanceScreensaver(state, ctx({ poolLength: 2 })) // photo 1 (shownInRun = 2)
    expect(state.mode).toBe('photo')
    state = advanceScreensaver(state, ctx({ poolLength: 2 })) // whole pool seen → clock
    expect(state.mode).toBe('clock')
  })

  it('stays on the clock when there are no photos and nothing else is due', () => {
    const photo: ScreensaverState = { mode: 'photo', photoIndex: 0, shownInRun: 1 }
    expect(advanceScreensaver(photo, ctx({ poolLength: 0 })).mode).toBe('clock')
  })

  describe('info screens (bins / meals)', () => {
    it('inserts bins then meals after the clock when both are due', () => {
      const clock: ScreensaverState = { mode: 'clock', photoIndex: 4, shownInRun: 0 }
      const bins = advanceScreensaver(clock, ctx({ binsAvailable: true, mealAvailable: true }))
      expect(bins.mode).toBe('bins')
      const meals = advanceScreensaver(bins, ctx({ binsAvailable: true, mealAvailable: true }))
      expect(meals.mode).toBe('meals')
      // …then back to photos, resuming the pool from the next asset.
      const back = advanceScreensaver(meals, ctx({ binsAvailable: true, mealAvailable: true }))
      expect(back).toEqual({ mode: 'photo', photoIndex: 5, shownInRun: 1 })
    })

    it('skips bins when only meals is due', () => {
      const clock: ScreensaverState = { mode: 'clock', photoIndex: 0, shownInRun: 0 }
      expect(advanceScreensaver(clock, ctx({ mealAvailable: true })).mode).toBe('meals')
    })

    it('skips meals when only bins is due, returning to photos after', () => {
      const clock: ScreensaverState = { mode: 'clock', photoIndex: 0, shownInRun: 0 }
      const bins = advanceScreensaver(clock, ctx({ binsAvailable: true }))
      expect(bins.mode).toBe('bins')
      expect(advanceScreensaver(bins, ctx({ binsAvailable: true })).mode).toBe('photo')
    })

    it('rotates clock → bins → meals → clock when photos are off', () => {
      const full = ctx({ poolLength: 0, binsAvailable: true, mealAvailable: true })
      let state: ScreensaverState = { mode: 'clock', photoIndex: 0, shownInRun: 0 }
      state = advanceScreensaver(state, full)
      expect(state.mode).toBe('bins')
      state = advanceScreensaver(state, full)
      expect(state.mode).toBe('meals')
      state = advanceScreensaver(state, full)
      expect(state.mode).toBe('clock')
    })

    it('falls back to the clock from a photo run when only bins/meals would follow but are empty', () => {
      // A completed run with nothing else available lands on the clock.
      const done: ScreensaverState = { mode: 'photo', photoIndex: 4, shownInRun: PHOTOS_PER_RUN }
      expect(advanceScreensaver(done, ctx()).mode).toBe('clock')
    })
  })
})

describe('phaseDurationMs', () => {
  it('uses the configured photo and clock durations', () => {
    expect(phaseDurationMs({ mode: 'photo', photoIndex: 0, shownInRun: 1 }, settings)).toBe(30_000)
    expect(phaseDurationMs({ mode: 'clock', photoIndex: 0, shownInRun: 0 }, settings)).toBe(120_000)
  })

  it('holds the info screens for their fixed 20s', () => {
    expect(phaseDurationMs({ mode: 'bins', photoIndex: 0, shownInRun: 0 }, settings)).toBe(
      BINS_DISPLAY_SECONDS * 1000,
    )
    expect(phaseDurationMs({ mode: 'meals', photoIndex: 0, shownInRun: 0 }, settings)).toBe(
      MEALS_DISPLAY_SECONDS * 1000,
    )
  })
})
