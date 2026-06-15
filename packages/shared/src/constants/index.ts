export const APP_NAME = 'Hame'

export const ROLES = ['ADMIN', 'MEMBER'] as const
export type Role = (typeof ROLES)[number]

/** Default hex colour assigned to a new user if none chosen. */
export const DEFAULT_USER_COLOUR = '#3B82F6'

/** Regex for a 6-digit hex colour, e.g. "#3B82F6". */
export const HEX_COLOUR_REGEX = /^#[0-9a-f]{6}$/i
