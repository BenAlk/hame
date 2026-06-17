export const APP_NAME = 'Hame'

export const ROLES = ['ADMIN', 'MEMBER'] as const
export type Role = (typeof ROLES)[number]

/** Default hex colour assigned to a new user if none chosen. */
export const DEFAULT_USER_COLOUR = '#3B82F6'

/** Regex for a 6-digit hex colour, e.g. "#3B82F6". */
export const HEX_COLOUR_REGEX = /^#[0-9a-f]{6}$/i

/**
 * Double-submit CSRF protection: the server sets a readable cookie and the
 * client echoes its value back in this header on state-changing requests.
 * Shared so both sides reference one source of truth.
 */
export const CSRF_COOKIE = 'hame_csrf'
export const CSRF_HEADER = 'x-csrf-token'
