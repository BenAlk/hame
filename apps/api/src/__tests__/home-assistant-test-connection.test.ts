import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { testHomeAssistantConnection } from '../integrations/home-assistant/test-connection.js'

/** Minimal Response stub for the two endpoints the probe calls. */
function ok(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('testHomeAssistantConnection', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('reports ok with the version on a good token', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/api/')) return Promise.resolve(ok({ message: 'API running.' }))
      return Promise.resolve(ok({ version: '2026.6.1' }))
    })
    const result = await testHomeAssistantConnection('http://ha.test', 'tok')
    expect(result).toEqual({
      ok: true,
      message: 'Connected to Home Assistant.',
      version: '2026.6.1',
    })
  })

  it('flags a rejected token (401)', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({}, 401))
    const result = await testHomeAssistantConnection('http://ha.test', 'bad')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/token was rejected/i)
  })

  it('flags an unreachable server', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'))
    const result = await testHomeAssistantConnection('http://nope.test', 'tok')
    expect(result).toEqual({ ok: false, message: 'Could not reach Home Assistant at that URL.' })
  })

  it('still succeeds when the version endpoint fails', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/api/')) return Promise.resolve(ok({ message: 'API running.' }))
      return Promise.reject(new Error('boom'))
    })
    const result = await testHomeAssistantConnection('http://ha.test', 'tok')
    expect(result).toEqual({
      ok: true,
      message: 'Connected to Home Assistant.',
      version: undefined,
    })
  })
})
