import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import type { ApiErrorBody } from '@hame/shared'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'

/** Centralised error handler — the single place that formats error responses. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {}
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_'
      ;(details[key] ??= []).push(issue.message)
    }
    const body: ApiErrorBody = {
      error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details },
    }
    res.status(400).json(body)
    return
  }

  if (err instanceof HttpError) {
    const body: ApiErrorBody = {
      error: { message: err.message, code: err.code, details: err.details },
    }
    res.status(err.status).json(body)
    return
  }

  logger.error({ err }, 'Unhandled error')
  const body: ApiErrorBody = {
    error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
  }
  res.status(500).json(body)
}
