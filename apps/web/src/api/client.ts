import type { ApiErrorBody } from '@hame/shared'

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

/** Thin typed fetch wrapper. Sends/receives JSON, includes credentials. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
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
