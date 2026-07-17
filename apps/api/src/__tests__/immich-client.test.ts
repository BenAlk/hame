import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAlbumAssetIds } from '../integrations/immich/client.js'

const conn = { url: 'http://immich.local:2283', apiKey: 'secret' }

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchAlbumAssetIds', () => {
  it('pages through search/metadata until nextPage runs out, image-only', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          assets: {
            items: [
              { id: 'p1', type: 'IMAGE' },
              { id: 'v1', type: 'VIDEO' },
            ],
            nextPage: '2',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ assets: { items: [{ id: 'p2', type: 'IMAGE' }], nextPage: null } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const ids = await fetchAlbumAssetIds(conn, 'album-1')

    expect(ids).toEqual(['p1', 'p2'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Hits the search endpoint as a POST with the album filter and advancing page.
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/search/metadata')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({ albumIds: ['album-1'], type: 'IMAGE', page: 1 })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ page: 2 })
  })

  it('throws on a non-OK search response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403 } as unknown as Response),
    )
    await expect(fetchAlbumAssetIds(conn, 'album-1')).rejects.toThrow(/403/)
  })
})
