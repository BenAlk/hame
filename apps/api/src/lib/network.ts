import type { Request } from 'express'
import { env } from './env.js'

interface ParsedIp {
  version: 4 | 6
  value: bigint
}

interface ParsedCidr extends ParsedIp {
  prefix: number
}

/** Parse an IPv4, IPv6, or IPv4-mapped IPv6 address. Returns null if malformed. */
export function parseIp(input: string): ParsedIp | null {
  let ip = input.trim()

  // IPv4-mapped IPv6 (e.g. "::ffff:192.168.0.1") collapses to plain IPv4.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped) ip = mapped[1]

  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.')
    if (parts.length !== 4) return null
    let value = 0n
    for (const part of parts) {
      const n = Number(part)
      if (!Number.isInteger(n) || n < 0 || n > 255) return null
      value = (value << 8n) | BigInt(n)
    }
    return { version: 4, value }
  }

  if (ip.includes(':')) {
    const value = parseIpv6(ip)
    return value === null ? null : { version: 6, value }
  }

  return null
}

function parseIpv6(ip: string): bigint | null {
  const halves = ip.split('::')
  if (halves.length > 2) return null

  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []

  let groups: string[]
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length)
    if (missing < 0) return null
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  let value = 0n
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null
    value = (value << 16n) | BigInt(parseInt(group, 16))
  }
  return value
}

function parseCidr(cidr: string): ParsedCidr | null {
  const [ip, prefixPart] = cidr.split('/')
  const parsed = parseIp(ip ?? '')
  if (!parsed) return null
  const bits = parsed.version === 4 ? 32 : 128
  const prefix = prefixPart === undefined ? bits : Number(prefixPart)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) return null
  return { ...parsed, prefix }
}

function inCidr(ip: ParsedIp, cidr: ParsedCidr): boolean {
  if (ip.version !== cidr.version) return false
  const bits = cidr.version === 4 ? 32 : 128
  if (cidr.prefix === 0) return true
  const full = (1n << BigInt(bits)) - 1n
  const mask = (full << BigInt(bits - cidr.prefix)) & full
  return (ip.value & mask) === (cidr.value & mask)
}

// Parse the configured local CIDRs once at startup (invalid entries dropped).
const LOCAL_CIDRS: ParsedCidr[] = env.LOCAL_NETWORK_CIDRS.map(parseCidr).filter(
  (c): c is ParsedCidr => c !== null,
)

function getClientIp(req: Request): string | undefined {
  return req.ip ?? req.socket.remoteAddress ?? undefined
}

/**
 * Is this request coming from the local network? Used to pick the session idle
 * window (long on-LAN, short off-LAN). External traffic arrives via Cloudflare,
 * so the presence of CF headers is treated as definitively external; otherwise
 * the resolved client IP must fall within LOCAL_NETWORK_CIDRS. See spec §11.
 */
export function isLocalRequest(req: Request): boolean {
  if (req.headers['cf-connecting-ip'] || req.headers['cf-ray']) return false
  const ip = getClientIp(req)
  if (!ip) return false
  const parsed = parseIp(ip)
  if (!parsed) return false
  return LOCAL_CIDRS.some((cidr) => inCidr(parsed, cidr))
}
