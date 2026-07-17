import { describe, it, expect } from 'vitest'
import {
  buildAssetPool,
  extractAlbums,
  extractImageAssetIds,
  extractSearchAssetIds,
  shuffle,
} from '../integrations/immich/assets.js'

describe('extractAlbums', () => {
  it('maps Immich albumName/assetCount to the picker shape', () => {
    const albums = extractAlbums([
      { id: 'a1', albumName: 'Holidays', assetCount: 42 },
      { id: 'a2', albumName: 'Pets', assetCount: 0 },
    ])
    expect(albums).toEqual([
      { id: 'a1', name: 'Holidays', assetCount: 42 },
      { id: 'a2', name: 'Pets', assetCount: 0 },
    ])
  })

  it('falls back to the id when a name is missing and defaults a bad count to 0', () => {
    const albums = extractAlbums([{ id: 'a1' }, { id: 'a2', assetCount: 'nope' }])
    expect(albums).toEqual([
      { id: 'a1', name: 'a1', assetCount: 0 },
      { id: 'a2', name: 'a2', assetCount: 0 },
    ])
  })

  it('skips malformed entries and non-arrays', () => {
    expect(extractAlbums([{ albumName: 'no id' }, null, 5])).toEqual([])
    expect(extractAlbums({})).toEqual([])
    expect(extractAlbums(null)).toEqual([])
  })
})

describe('extractImageAssetIds', () => {
  it('keeps image assets and skips videos', () => {
    const ids = extractImageAssetIds({
      assets: [
        { id: 'p1', type: 'IMAGE' },
        { id: 'v1', type: 'VIDEO' },
        { id: 'p2', type: 'image' },
      ],
    })
    expect(ids).toEqual(['p1', 'p2'])
  })

  it('treats a missing type as an image (tolerant of older Immich)', () => {
    expect(extractImageAssetIds({ assets: [{ id: 'p1' }] })).toEqual(['p1'])
  })

  it('returns [] when there are no assets', () => {
    expect(extractImageAssetIds({})).toEqual([])
    expect(extractImageAssetIds(null)).toEqual([])
  })
})

describe('extractSearchAssetIds', () => {
  it('pulls image ids out of the search response and skips videos', () => {
    const { ids, nextPage } = extractSearchAssetIds({
      assets: {
        items: [
          { id: 'p1', type: 'IMAGE' },
          { id: 'v1', type: 'VIDEO' },
          { id: 'p2', type: 'image' },
        ],
        nextPage: null,
      },
    })
    expect(ids).toEqual(['p1', 'p2'])
    expect(nextPage).toBeNull()
  })

  it('normalises a string nextPage cursor to a number', () => {
    expect(extractSearchAssetIds({ assets: { items: [], nextPage: '2' } }).nextPage).toBe(2)
    expect(extractSearchAssetIds({ assets: { items: [], nextPage: 3 } }).nextPage).toBe(3)
  })

  it('returns null nextPage for a missing/blank/non-numeric cursor', () => {
    expect(extractSearchAssetIds({ assets: { items: [] } }).nextPage).toBeNull()
    expect(extractSearchAssetIds({ assets: { items: [], nextPage: '' } }).nextPage).toBeNull()
    expect(extractSearchAssetIds({ assets: { items: [], nextPage: 'x' } }).nextPage).toBeNull()
  })

  it('returns [] when the response has no assets/items', () => {
    expect(extractSearchAssetIds({}).ids).toEqual([])
    expect(extractSearchAssetIds({ assets: {} }).ids).toEqual([])
    expect(extractSearchAssetIds(null).ids).toEqual([])
  })
})

describe('shuffle', () => {
  it('is a permutation and is deterministic under a fixed RNG', () => {
    const rng = () => 0 // always picks j = 0
    const out = shuffle(['a', 'b', 'c'], rng)
    expect([...out].sort()).toEqual(['a', 'b', 'c'])
    expect(shuffle(['a', 'b', 'c'], rng)).toEqual(out)
  })

  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c']
    shuffle(input, () => 0.5)
    expect(input).toEqual(['a', 'b', 'c'])
  })
})

describe('buildAssetPool', () => {
  it('de-duplicates ids', () => {
    expect(buildAssetPool(['a', 'b', 'a', 'c'], false)).toEqual(['a', 'b', 'c'])
  })

  it('keeps album order when shuffle is off', () => {
    expect(buildAssetPool(['a', 'b', 'c'], false)).toEqual(['a', 'b', 'c'])
  })

  it('shuffles when asked (still a permutation of the unique set)', () => {
    const pool = buildAssetPool(['a', 'b', 'c', 'a'], true, () => 0)
    expect([...pool].sort()).toEqual(['a', 'b', 'c'])
  })
})
