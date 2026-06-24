/** An error carrying an HTTP status code, thrown by services/controllers. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'HttpError'
  }

  static badRequest(message: string, details?: Record<string, string[]>) {
    return new HttpError(400, message, 'BAD_REQUEST', details)
  }

  static unauthorized(message = 'Unauthorized') {
    return new HttpError(401, message, 'UNAUTHORIZED')
  }

  static forbidden(message = 'Forbidden') {
    return new HttpError(403, message, 'FORBIDDEN')
  }

  static notFound(message = 'Not found') {
    return new HttpError(404, message, 'NOT_FOUND')
  }

  static conflict(message: string) {
    return new HttpError(409, message, 'CONFLICT')
  }

  /** An upstream dependency (e.g. Home Assistant) was unreachable or errored. */
  static badGateway(message = 'Upstream service error') {
    return new HttpError(502, message, 'BAD_GATEWAY')
  }
}
