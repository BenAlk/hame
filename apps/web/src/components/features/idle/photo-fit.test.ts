import { describe, it, expect } from 'vitest'
import { choosePhotoFit, visibleFractionUnderCover, type Size } from './photo-fit'

/** A landscape wall tablet — the screensaver's primary target (spec §8.14). */
const TABLET: Size = { width: 1280, height: 800 }

const photo = (width: number, height: number): Size => ({ width, height })

describe('visibleFractionUnderCover', () => {
  it('crops nothing when the shapes match', () => {
    expect(visibleFractionUnderCover(1.6, 1.6)).toBe(1)
  })

  it('is symmetric — a photo as much wider as another is taller loses the same', () => {
    expect(visibleFractionUnderCover(3.2, 1.6)).toBeCloseTo(visibleFractionUnderCover(0.8, 1.6))
  })

  it('reports the severe loss on a portrait photo in a landscape frame', () => {
    // 3:4 on 16:10 — under half the picture survives, which is the reported bug.
    expect(visibleFractionUnderCover(0.75, 1.6)).toBeCloseTo(0.469, 3)
  })

  it('treats a degenerate aspect as uncropped rather than dividing by zero', () => {
    expect(visibleFractionUnderCover(0, 1.6)).toBe(1)
    expect(visibleFractionUnderCover(Number.NaN, 1.6)).toBe(1)
  })
})

describe('choosePhotoFit', () => {
  it('fills the frame for the common landscape shapes', () => {
    expect(choosePhotoFit(photo(3000, 2000), TABLET)).toBe('cover') // 3:2
    expect(choosePhotoFit(photo(1920, 1080), TABLET)).toBe('cover') // 16:9
    expect(choosePhotoFit(photo(4000, 3000), TABLET)).toBe('cover') // 4:3
    expect(choosePhotoFit(photo(1280, 800), TABLET)).toBe('cover') // exactly the frame
  })

  it('shows a portrait photo whole instead of zooming into its middle', () => {
    expect(choosePhotoFit(photo(3000, 4000), TABLET)).toBe('contain') // 3:4 camera
    expect(choosePhotoFit(photo(1080, 1920), TABLET)).toBe('contain') // 9:16 phone
  })

  it('shows a panorama whole too — cover crops it just as hard, from the sides', () => {
    expect(choosePhotoFit(photo(6000, 2000), TABLET)).toBe('contain')
  })

  it('shows a square photo whole rather than cutting a third off it', () => {
    expect(choosePhotoFit(photo(2000, 2000), TABLET)).toBe('contain')
  })

  it('fits a portrait photo to a portrait frame, so the rule follows the display', () => {
    expect(choosePhotoFit(photo(3000, 4000), { width: 800, height: 1280 })).toBe('cover')
    expect(choosePhotoFit(photo(4000, 3000), { width: 800, height: 1280 })).toBe('contain')
  })

  it('falls back to filling when the frame or the photo has no usable size', () => {
    expect(choosePhotoFit(photo(3000, 4000), { width: 0, height: 0 })).toBe('cover')
    expect(choosePhotoFit(photo(0, 0), TABLET)).toBe('cover')
  })
})
