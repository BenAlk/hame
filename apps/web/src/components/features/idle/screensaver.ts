/**
 * Pure state machine for the idle screensaver's rotation (spec §8.14). Kept free
 * of React/timers so the transition logic is unit-tested in isolation — the same
 * split as the API's socket-free helpers.
 *
 * The ring is: a run of photos (each `photoDisplaySeconds`) → the clock (for
 * `clockDisplaySeconds`) → an optional bins screen → an optional meals screen →
 * photos again — looping until touch wakes the display. The two info screens only
 * appear when they have content *right now* (a bin due today/tomorrow; a meal
 * planned for the current time-of-day slot), so an empty one is skipped at the
 * transition rather than shown blank. Clock is always in the ring, so with no
 * photos and nothing to show it stays clock-only (the fallback).
 */

import type { IdleModeSettings } from '@hame/shared'

/** How many photos show before the next screen. A fixed cadence avoids adding
 *  another setting; small enough that the clock returns regularly. */
export const PHOTOS_PER_RUN = 5

/** The two info screens hold for a fixed 20s each (not a per-household setting). */
export const BINS_DISPLAY_SECONDS = 20
export const MEALS_DISPLAY_SECONDS = 20

export type ScreensaverMode = 'photo' | 'clock' | 'bins' | 'meals'

/** What has content at a given moment — fed in at each transition so the machine
 *  can skip an empty info screen. `poolLength` is the photo pool size. */
export interface ScreensaverContext {
  poolLength: number
  binsAvailable: boolean
  mealAvailable: boolean
}

export interface ScreensaverState {
  mode: ScreensaverMode
  /** Index into the asset pool while in (or resuming) photo mode. */
  photoIndex: number
  /** Photos shown so far in the current run (resets when another screen takes over). */
  shownInRun: number
}

/** Fixed rotation order; unavailable screens are skipped at each transition. */
const RING: ScreensaverMode[] = ['photo', 'clock', 'bins', 'meals']

function isAvailable(mode: ScreensaverMode, ctx: ScreensaverContext): boolean {
  switch (mode) {
    case 'photo':
      return ctx.poolLength > 0
    case 'clock':
      return true // the guaranteed fallback — always in the ring
    case 'bins':
      return ctx.binsAvailable
    case 'meals':
      return ctx.mealAvailable
  }
}

/** The next screen after `mode` in the ring that currently has content. Clock is
 *  always available, so this always resolves. */
function nextMode(mode: ScreensaverMode, ctx: ScreensaverContext): ScreensaverMode {
  const start = RING.indexOf(mode)
  for (let step = 1; step <= RING.length; step++) {
    const candidate = RING[(start + step) % RING.length]!
    if (isAvailable(candidate, ctx)) return candidate
  }
  return 'clock'
}

/** Start on a photo when the pool has any, otherwise the clock. */
export function initialScreensaverState(poolLength: number): ScreensaverState {
  return poolLength > 0
    ? { mode: 'photo', photoIndex: 0, shownInRun: 1 }
    : { mode: 'clock', photoIndex: 0, shownInRun: 0 }
}

/**
 * The next state when the current phase's timer elapses. A photo run advances
 * photo-by-photo (wrapping) until it completes — or the small pool is exhausted —
 * then hands over to the next available screen in the ring; every non-photo
 * screen shows once before the rotation returns to photos.
 */
export function advanceScreensaver(
  state: ScreensaverState,
  ctx: ScreensaverContext,
): ScreensaverState {
  // Continue the photo run until it completes (or once we've shown the whole
  // small pool, so the other screens still get a turn for a few-photo household).
  if (state.mode === 'photo' && ctx.poolLength > 0) {
    const runComplete = state.shownInRun >= Math.min(PHOTOS_PER_RUN, ctx.poolLength)
    if (!runComplete) {
      return {
        mode: 'photo',
        photoIndex: (state.photoIndex + 1) % ctx.poolLength,
        shownInRun: state.shownInRun + 1,
      }
    }
  }

  const next = nextMode(state.mode, ctx)
  if (next === 'photo') {
    // Re-entering photos resumes from the next asset in the pool (poolLength > 0
    // is guaranteed here, since 'photo' was reported available).
    return { mode: 'photo', photoIndex: (state.photoIndex + 1) % ctx.poolLength, shownInRun: 1 }
  }
  return { ...state, mode: next, shownInRun: 0 }
}

/** Milliseconds the current phase should hold before `advanceScreensaver`. */
export function phaseDurationMs(state: ScreensaverState, settings: IdleModeSettings): number {
  const seconds =
    state.mode === 'photo'
      ? settings.photoDisplaySeconds
      : state.mode === 'clock'
        ? settings.clockDisplaySeconds
        : state.mode === 'bins'
          ? BINS_DISPLAY_SECONDS
          : MEALS_DISPLAY_SECONDS
  return Math.max(1, seconds) * 1000
}
