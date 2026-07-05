import { lookup } from 'node:dns/promises'
import { HttpError } from './http-error.js'
import { isBlockedFetchIp, parseIp } from './network.js'

/**
 * SSRF guard for fetches whose URL comes from user input — recipe import (spec
 * §8.5) and external iCal feeds (§8.10). These fetch *arbitrary web content*, so
 * they must be prevented from reaching the homelab's own services (Home
 * Assistant, TrueNAS, other containers on the LAN).
 *
 * NB: this deliberately does NOT wrap the configured-integration clients (Home
 * Assistant, Immich, Ollama) — those are admin-set and are *meant* to point at
 * private LAN addresses, so blocking private ranges there would break them.
 *
 * Known limitation: {@link assertPublicHttpUrl} resolves and checks the host
 * before connecting, so a determined attacker could DNS-rebind between the check
 * and the socket. {@link safeFetch} re-validates on every redirect hop, which
 * closes the common cases; pinning the resolved address into the socket would be
 * the fully airtight step.
 */

const MAX_REDIRECTS = 5

/**
 * Reject a URL that isn't plain http(s) or that resolves to a loopback/private/
 * link-local/reserved address. Throws {@link HttpError} (400) on any violation.
 */
export async function assertPublicHttpUrl(raw: string): Promise<void> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw HttpError.badRequest('Invalid URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw HttpError.badRequest('Only http and https URLs are allowed')
  }

  // Strip IPv6 brackets from a literal host (e.g. "[::1]" -> "::1").
  const host = url.hostname.replace(/^\[|\]$/g, '')

  // A literal IP is checked directly; a hostname is resolved to every address it
  // maps to, and blocked if *any* is disallowed (fail closed on resolve errors).
  let addresses: string[]
  if (parseIp(host)) {
    addresses = [host]
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address)
    } catch {
      throw HttpError.badRequest('Could not resolve that host')
    }
    if (addresses.length === 0) throw HttpError.badRequest('Could not resolve that host')
  }

  for (const address of addresses) {
    if (isBlockedFetchIp(address)) {
      throw HttpError.badRequest('That URL resolves to a disallowed (internal) address')
    }
  }
}

/**
 * Like `fetch`, but validates the target — and every redirect hop — against
 * {@link assertPublicHttpUrl} first. Redirects are followed manually so a public
 * URL can't 302 the request onto an internal address.
 */
export async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(current)
    const res = await fetch(current, { ...init, redirect: 'manual' })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString()
      continue
    }
    return res
  }
  throw HttpError.badRequest('Too many redirects')
}
