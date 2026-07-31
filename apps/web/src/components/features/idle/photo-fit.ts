/**
 * How one screensaver photo is fitted to the frame (spec §8.14).
 *
 * Filling the frame edge-to-edge (`cover`) is the right look while a photo's
 * shape is close to the screen's, but it crops whatever doesn't fit — and the
 * further the two shapes diverge, the more of the picture is thrown away. A
 * portrait phone photo on a landscape wall tablet loses more than half its
 * height, which reads as a photo zoomed to absurdity rather than as a crop.
 *
 * So the choice is made per photo, from the one thing the frontend can know
 * about an Immich asset: the dimensions the browser reports once it has loaded.
 * Nothing upstream carries them — the idle pool is bare asset ids (§8.14
 * "Backend Proxy"), and the proxied preview has had its EXIF stripped.
 */

export type PhotoFit = 'cover' | 'contain'

/**
 * The share of a photo still on screen under `cover`, as a fraction of its area
 * (1 = nothing cropped). Symmetric in the two aspect ratios: a photo taller than
 * the frame loses height, a wider one loses width, and each loses in proportion
 * to how far apart the shapes are.
 */
export function visibleFractionUnderCover(imageAspect: number, frameAspect: number): number {
  if (!isUsableAspect(imageAspect) || !isUsableAspect(frameAspect)) return 1
  return Math.min(imageAspect, frameAspect) / Math.max(imageAspect, frameAspect)
}

/**
 * Below this, `cover` is cropping more than it is framing and the photo is shown
 * whole instead. 0.8 keeps the common landscape shapes full-bleed — 3:2 and 16:9
 * on a 16:10 tablet stay above 0.9, 4:3 sits at 0.83 — while portrait photos
 * (0.47 for 3:4, 0.35 for a 9:16 phone shot) and panoramas fall below it.
 */
export const MIN_VISIBLE_FRACTION = 0.8

/** Pixel dimensions of either a photo or the frame it is shown in. */
export interface Size {
  width: number
  height: number
}

/**
 * Pick the fit for one photo. Degenerate input (a frame not yet measured, an
 * image whose dimensions the browser never reported) falls back to `cover`, the
 * behaviour everything had before this existed.
 */
export function choosePhotoFit(image: Size, frame: Size): PhotoFit {
  const imageAspect = aspect(image)
  const frameAspect = aspect(frame)
  if (imageAspect === null || frameAspect === null) return 'cover'
  return visibleFractionUnderCover(imageAspect, frameAspect) < MIN_VISIBLE_FRACTION
    ? 'contain'
    : 'cover'
}

function aspect({ width, height }: Size): number | null {
  const ratio = width / height
  return isUsableAspect(ratio) ? ratio : null
}

function isUsableAspect(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio > 0
}
