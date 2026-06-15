import type { RequestHandler } from 'express'
import type { ApiErrorBody } from '@hame/shared'

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = {
    error: { message: 'Route not found', code: 'NOT_FOUND' },
  }
  res.status(404).json(body)
}
