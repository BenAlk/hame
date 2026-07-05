import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind class names, resolving conflicts (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A URL safe to place in an `href`/`src`: only `http`/`https`. Guards against a
 * `javascript:`/`data:` URL slipping through to a link (the shared `httpUrl`
 * schema blocks these on input; this is defence-in-depth at the render site).
 * Returns the URL when safe, otherwise `undefined`.
 */
export function safeExternalUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}
