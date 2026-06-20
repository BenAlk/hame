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

// ── Phase 2: Shopping, items & pantry ────────────────────────────────────────

export const LIST_STATUSES = ['ACTIVE', 'ARCHIVED'] as const
export type ListStatus = (typeof LIST_STATUSES)[number]

/**
 * Semantic tag whose presence makes an Item appear in the shopping-list
 * quick-add dropdown (spec §8.2). Not enforced in the schema — just a name.
 */
export const QUICK_ADD_TAG = 'quick-add'

/** Items expiring within this many days surface in the "expiring soon" widget. */
export const EXPIRY_SOON_DAYS = 3

// ── Phase 3: Chores & pets ───────────────────────────────────────────────────

export const RECURRENCE_TYPES = ['INTERVAL', 'WEEKLY', 'DATE_OF_MONTH', 'ONE_OFF'] as const
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number]

export const ASSIGNMENT_MODES = ['FIXED', 'ROTATING'] as const
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number]

export const SPECIES = ['DOG', 'CAT', 'BIRD', 'RABBIT', 'OTHER'] as const
export type Species = (typeof SPECIES)[number]

/** Ordered Monday-first so day arithmetic and UI both read naturally. */
export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const
export type Weekday = (typeof WEEKDAYS)[number]

// ── Phase 4: Recipes & meal planning ─────────────────────────────────────────

/** Ordered through the day so meal-plan grids read top-to-bottom naturally. */
export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const
export type MealType = (typeof MEAL_TYPES)[number]

/** Servings a recipe assumes when none is given — the scaling baseline (§8.5). */
export const DEFAULT_SERVINGS = 4

// ── Phase 4.5: Ingredient normalisation ──────────────────────────────────────

/**
 * Layered ingredient-normalisation strategies (spec §10 Phase 4.5). Each layer
 * builds on the one before it: `BASIC` is the regex parser alone (the always-on
 * floor), `DICTIONARY` overrides it with a bundled lookup table, and `LLM` adds
 * a batched Ollama pass on top — every layer falls back to the one below.
 * The household picks one; the default needs no setup.
 */
export const NORMALISER_STRATEGIES = ['BASIC', 'DICTIONARY', 'LLM'] as const
export type NormaliserStrategy = (typeof NORMALISER_STRATEGIES)[number]

/** Default Ollama model used for ingredient normalisation when none is set. */
export const DEFAULT_OLLAMA_MODEL = 'llama3.1'
