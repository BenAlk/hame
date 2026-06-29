/**
 * Pure state machine for the idle screensaver's photo ⇄ clock cycle (spec
 * §8.14). Kept free of React/timers so the transition logic is unit-tested in
 * isolation — the same split as the API's socket-free helpers.
 *
 * The cycle is: show a run of photos (each for `photoDisplaySeconds`), then the
 * clock (for `clockDisplaySeconds`), then photos again — looping until touch
 * wakes the display. With no photos available (Immich off/unconfigured) it stays
 * on the clock, which is the clock-only fallback.
 */

import type { IdleModeSettings } from '@hame/shared'

/** How many photos show before the clock appears. A fixed cadence avoids adding
 *  another setting; small enough that the clock returns regularly. */
export const PHOTOS_PER_RUN = 5

export type ScreensaverMode = 'photo' | 'clock'

export interface ScreensaverState {
  mode: ScreensaverMode
  /** Index into the asset pool while in photo mode. */
  photoIndex: number
  /** Photos shown so far in the current run (resets when the clock takes over). */
  shownInRun: number
}

/** Start on a photo when the pool has any, otherwise the clock. */
export function initialScreensaverState(poolLength: number): ScreensaverState {
  return poolLength > 0
    ? { mode: 'photo', photoIndex: 0, shownInRun: 1 }
    : { mode: 'clock', photoIndex: 0, shownInRun: 0 }
}

/**
 * The next state when the current phase's timer elapses. Photo mode advances
 * through the pool (wrapping) until a run completes or the pool is exhausted,
 * then hands over to the clock; the clock hands back to photos (or stays put
 * when there are none).
 */
export function advanceScreensaver(state: ScreensaverState, poolLength: number): ScreensaverState {
  if (poolLength <= 0) return { mode: 'clock', photoIndex: 0, shownInRun: 0 }

  if (state.mode === 'clock') {
    return { mode: 'photo', photoIndex: (state.photoIndex + 1) % poolLength, shownInRun: 1 }
  }

  // Photo mode: end the run after PHOTOS_PER_RUN, or once we've shown the whole
  // (small) pool, so the clock still appears for a household with few photos.
  const runComplete = state.shownInRun >= Math.min(PHOTOS_PER_RUN, poolLength)
  if (runComplete) return { ...state, mode: 'clock', shownInRun: 0 }
  return {
    mode: 'photo',
    photoIndex: (state.photoIndex + 1) % poolLength,
    shownInRun: state.shownInRun + 1,
  }
}

/** Milliseconds the current phase should hold before `advanceScreensaver`. */
export function phaseDurationMs(state: ScreensaverState, settings: IdleModeSettings): number {
  const seconds =
    state.mode === 'photo' ? settings.photoDisplaySeconds : settings.clockDisplaySeconds
  return Math.max(1, seconds) * 1000
}
