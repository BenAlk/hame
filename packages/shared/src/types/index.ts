/** Standard error envelope returned by the API. */
export interface ApiErrorBody {
  error: {
    message: string
    code?: string
    /** Field-level validation issues, keyed by path. */
    details?: Record<string, string[]>
  }
}

/** Generic success envelope for endpoints that return a single resource. */
export interface ApiResponse<T> {
  data: T
}
