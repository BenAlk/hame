import { describe, it, expect } from 'vitest'
import { assertPublicHttpUrl } from '../lib/safe-fetch.js'
import { isBlockedFetchIp } from '../lib/network.js'

describe('assertPublicHttpUrl', () => {
  it('accepts a public http(s) URL by IP literal', async () => {
    await expect(assertPublicHttpUrl('https://1.1.1.1/feed.ics')).resolves.toBeUndefined()
    await expect(assertPublicHttpUrl('http://8.8.8.8')).resolves.toBeUndefined()
  })

  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicHttpUrl('javascript:alert(1)')).rejects.toMatchObject({ status: 400 })
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toMatchObject({ status: 400 })
    await expect(assertPublicHttpUrl('ftp://8.8.8.8/x')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a malformed URL', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toMatchObject({ status: 400 })
  })

  it('blocks loopback / private / link-local literal addresses', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://localhost/', // resolves to loopback
      'http://10.0.0.5/',
      'http://192.168.1.10/',
      'http://172.16.4.4/',
      'http://169.254.169.254/latest/meta-data/', // cloud metadata
      'http://[::1]/',
    ]) {
      await expect(assertPublicHttpUrl(url), url).rejects.toMatchObject({ status: 400 })
    }
  })
})

describe('isBlockedFetchIp', () => {
  it('flags reserved ranges and allows public addresses', () => {
    expect(isBlockedFetchIp('127.0.0.1')).toBe(true)
    expect(isBlockedFetchIp('10.1.2.3')).toBe(true)
    expect(isBlockedFetchIp('192.168.0.1')).toBe(true)
    expect(isBlockedFetchIp('169.254.169.254')).toBe(true)
    expect(isBlockedFetchIp('::1')).toBe(true)
    expect(isBlockedFetchIp('fe80::1')).toBe(true)
    expect(isBlockedFetchIp('garbage')).toBe(true) // fail closed
    expect(isBlockedFetchIp('1.1.1.1')).toBe(false)
    expect(isBlockedFetchIp('8.8.8.8')).toBe(false)
  })
})
