import type { ApiErrorBody } from '@hame/shared'
import { CSRF_COOKIE, CSRF_HEADER } from '@hame/shared'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: ApiErrorBody,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Read a cookie value by name (used to echo the CSRF token back). */
function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Thin typed fetch wrapper. Sends/receives JSON, includes credentials. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }

  // Double-submit CSRF: echo the readable cookie back on state-changing requests.
  if (!SAFE_METHODS.has(method)) {
    const csrf = getCookie(CSRF_COOKIE)
    if (csrf) headers[CSRF_HEADER] = csrf
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  })

  if (!res.ok) {
    let body: ApiErrorBody | undefined
    try {
      body = (await res.json()) as ApiErrorBody
    } catch {
      // non-JSON error response
    }
    throw new ApiError(res.status, body?.error.message ?? res.statusText, body)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
