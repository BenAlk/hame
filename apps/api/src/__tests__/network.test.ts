import { describe, it, expect } from 'vitest'
import type { Request } from 'express'
import { isLocalRequest } from '../lib/network.js'

// Minimal Request stand-in for the fields isLocalRequest reads.
function req(opts: { ip?: string; headers?: Record<string, string> }): Request {
  return {
    ip: opts.ip,
    socket: { remoteAddress: opts.ip },
    headers: opts.headers ?? {},
  } as unknown as Request
}

describe('isLocalRequest', () => {
  it('treats private-range IPs with no CF headers as local', () => {
    expect(isLocalRequest(req({ ip: '192.168.1.20' }))).toBe(true)
    expect(isLocalRequest(req({ ip: '10.0.0.5' }))).toBe(true)
    expect(isLocalRequest(req({ ip: '172.16.4.4' }))).toBe(true)
    expect(isLocalRequest(req({ ip: '127.0.0.1' }))).toBe(true)
    expect(isLocalRequest(req({ ip: '::1' }))).toBe(true)
    expect(isLocalRequest(req({ ip: '::ffff:192.168.1.20' }))).toBe(true)
  })

  it('treats public IPs as external', () => {
    expect(isLocalRequest(req({ ip: '8.8.8.8' }))).toBe(false)
    expect(isLocalRequest(req({ ip: '172.32.0.1' }))).toBe(false) // just outside 172.16/12
  })

  it('treats any request carrying Cloudflare headers as external', () => {
    expect(
      isLocalRequest(req({ ip: '192.168.1.20', headers: { 'cf-connecting-ip': '8.8.8.8' } })),
    ).toBe(false)
    expect(isLocalRequest(req({ ip: '192.168.1.20', headers: { 'cf-ray': 'abc-LHR' } }))).toBe(
      false,
    )
  })

  it('is safe on missing/garbage IPs', () => {
    expect(isLocalRequest(req({}))).toBe(false)
    expect(isLocalRequest(req({ ip: 'not-an-ip' }))).toBe(false)
  })
})
