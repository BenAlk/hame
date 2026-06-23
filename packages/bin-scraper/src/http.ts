/** Minimal HTTP helper — a fetch wrapper with a timeout and a polite UA. */

const DEFAULT_TIMEOUT_MS = 20_000
const USER_AGENT = 'Mozilla/5.0 (compatible; uk-bin-scraper/0.1; +https://github.com/)'

/** Fetch a URL as text. Throws on a network error, timeout or non-2xx response. */
export async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${url} responded ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timeout)
  }
}
