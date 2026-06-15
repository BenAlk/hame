import type { RequestHandler } from 'express'
import type { ZodTypeAny, z } from 'zod'

/**
 * Validates `req.body` against a Zod schema, replacing it with the parsed
 * (and coerced) value. Throws ZodError on failure, handled centrally.
 */
export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body) as z.infer<T>
    next()
  }
}
