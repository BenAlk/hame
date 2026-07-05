import { z } from 'zod'

/**
 * A URL string constrained to the `http`/`https` schemes. Zod's `.url()` alone
 * accepts any parseable URL — including `javascript:` and `data:` — which, for a
 * value later rendered into an `<a href>` or `<img src>`, is a stored-XSS vector.
 * Restricting the scheme at the schema (shared by client and server) closes it at
 * the source for every user-supplied URL field (avatars, recipe/pet images,
 * recipe source links).
 */
export function httpUrl(message = 'Enter a valid http(s) URL') {
  // `.url()` accepts any scheme; the regex then constrains it to http(s), which
  // is what rejects `javascript:`/`data:`. (Uses a regex rather than `new URL()`
  // so it needs no DOM/Node lib in the shared package's tsconfig.)
  return z
    .string()
    .url(message)
    .regex(/^https?:\/\//i, message)
}
