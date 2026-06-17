import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '@/api/client'

/**
 * Map an {@link ApiError} from the backend onto a react-hook-form. Field-level
 * validation issues (the `details` map) are attached to their inputs; anything
 * else is returned as a single form-level message to display.
 */
export function applyApiErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (err instanceof ApiError) {
    const details = err.body?.error.details
    if (details && Object.keys(details).length > 0) {
      for (const [field, messages] of Object.entries(details)) {
        setError(field as Path<T>, { message: messages.join(', ') })
      }
      return null
    }
    return err.message
  }
  return 'Something went wrong. Please try again.'
}
