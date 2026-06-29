import { describe, it, expect } from 'vitest'
import type { IdleModeSettings } from '@hame/shared'
import {
  advanceScreensaver,
  initialScreensaverState,
  PHOTOS_PER_RUN,
  phaseDurationMs,
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
  updatedAt: new Date(),
}

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
      state = advanceScreensaver(state, 20)
      expect(state.mode).toBe('photo')
      seen.push(state.photoIndex)
    }
    expect(seen).toEqual([0, 1, 2, 3, 4])
    // After PHOTOS_PER_RUN photos, the clock takes over.
    state = advanceScreensaver(state, 20)
    expect(state.mode).toBe('clock')
  })

  it('returns from the clock to the next photo', () => {
    const clock: ScreensaverState = { mode: 'clock', photoIndex: 4, shownInRun: 0 }
    const next = advanceScreensaver(clock, 20)
    expect(next).toEqual({ mode: 'photo', photoIndex: 5, shownInRun: 1 })
  })

  it('wraps the photo index around the pool', () => {
    const last: ScreensaverState = { mode: 'clock', photoIndex: 19, shownInRun: 0 }
    expect(advanceScreensaver(last, 20).photoIndex).toBe(0)
  })

  it('ends the run early for a pool smaller than a full run', () => {
    let state = initialScreensaverState(2) // photo 0 shown (shownInRun = 1)
    state = advanceScreensaver(state, 2) // photo 1 shown (shownInRun = 2)
    expect(state.mode).toBe('photo')
    state = advanceScreensaver(state, 2) // whole pool seen → clock
    expect(state.mode).toBe('clock')
  })

  it('stays on the clock when there are no photos', () => {
    const photo: ScreensaverState = { mode: 'photo', photoIndex: 0, shownInRun: 1 }
    expect(advanceScreensaver(photo, 0).mode).toBe('clock')
  })
})

describe('phaseDurationMs', () => {
  it('uses the photo duration in photo mode and the clock duration in clock mode', () => {
    expect(phaseDurationMs({ mode: 'photo', photoIndex: 0, shownInRun: 1 }, settings)).toBe(30_000)
    expect(phaseDurationMs({ mode: 'clock', photoIndex: 0, shownInRun: 0 }, settings)).toBe(120_000)
  })
})
