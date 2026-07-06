import { z } from 'zod'
import { MEAL_TYPES, NORMALISER_STRATEGIES } from '../constants/index.js'
import { httpUrl } from './common.js'
import { ItemSchema } from './item.js'
import { TagSchema } from './tag.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

// ── Create / update ──────────────────────────────────────────────────────────

/**
 * One ingredient line on a create/update payload. Ingredients are linked to the
 * universal `Item` (spec §9.2) — by id when known, or by `name` for the server
 * to find-or-create (the same flow URL import and manual entry both use). The
 * `unit`/`isStaple` hints are only applied when the item is freshly minted.
 */
export const RecipeIngredientInputSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    itemName: z.string().min(1).max(80).optional(),
    quantity: z.number().positive('Quantity must be positive').nullish(),
    unit: z.string().max(20).nullish(),
    notes: z.string().max(200).nullish(),
    optional: z.boolean().optional(),
    /** Hint for a newly minted item: a non-shoppable staple (salt, water). */
    isStaple: z.boolean().optional(),
    /** Hint for a newly minted item: its canonical base unit (spec §9.2). */
    baseUnit: z.string().max(20).nullish(),
    /** Hint for a newly minted item: grams of one countable unit (1 onion ≈ 110 g). */
    typicalUnitGrams: z.number().positive().nullish(),
  })
  .refine((d) => Boolean(d.itemId) !== Boolean(d.itemName), {
    message: 'Provide either itemId or itemName, not both',
  })
export type RecipeIngredientInput = z.infer<typeof RecipeIngredientInputSchema>

export const RecipeStepInputSchema = z.object({
  text: z.string().min(1, 'Step text is required').max(2000),
})
export type RecipeStepInput = z.infer<typeof RecipeStepInputSchema>

/** Fields shared by create and update. Ingredients/steps replace wholesale. */
const RecipeFields = z.object({
  title: z.string().min(1, 'Title is required').max(120, 'Title is too long'),
  description: z.string().max(2000).nullish(),
  imageUrl: httpUrl().nullish(),
  sourceUrl: httpUrl().nullish(),
  prepTimeMinutes: z.number().int().nonnegative().nullish(),
  cookTimeMinutes: z.number().int().nonnegative().nullish(),
  servings: z.number().int().positive().max(100),
  ingredients: z.array(RecipeIngredientInputSchema),
  steps: z.array(RecipeStepInputSchema),
  tagIds: z.array(z.string().uuid()).optional(),
  /** Meal slots this recipe may auto-fill when generating a plan (spec §8.6). */
  mealTypes: z.array(z.enum(MEAL_TYPES)).optional(),
})

export const CreateRecipeSchema = RecipeFields
export type CreateRecipeInput = z.infer<typeof CreateRecipeSchema>

export const UpdateRecipeSchema = RecipeFields.partial().refine(
  atLeastOneField,
  atLeastOneFieldMessage,
)
export type UpdateRecipeInput = z.infer<typeof UpdateRecipeSchema>

/** Import a recipe from a URL by parsing its schema.org metadata (spec §8.5). */
export const ImportRecipeSchema = z.object({ url: httpUrl('Enter a valid URL') })
export type ImportRecipeInput = z.infer<typeof ImportRecipeSchema>

// ── Public shapes ────────────────────────────────────────────────────────────

export const RecipeIngredientSchema = z.object({
  id: z.string().uuid(),
  item: ItemSchema,
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
  optional: z.boolean(),
  order: z.number().int(),
})
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>

export const RecipeStepSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int(),
  text: z.string(),
})
export type RecipeStep = z.infer<typeof RecipeStepSchema>

export const RecipeSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  servings: z.number().int(),
  ingredients: z.array(RecipeIngredientSchema),
  steps: z.array(RecipeStepSchema),
  tags: z.array(TagSchema),
  mealTypes: z.array(z.enum(MEAL_TYPES)),
  createdById: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type Recipe = z.infer<typeof RecipeSchema>

/** Lightweight recipe shape for list/grid views (no ingredients/steps). */
export const RecipeSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  servings: z.number().int(),
  tags: z.array(TagSchema),
  mealTypes: z.array(z.enum(MEAL_TYPES)),
})
export type RecipeSummary = z.infer<typeof RecipeSummarySchema>

/**
 * One ingredient on an import draft. Mirrors the create payload's ingredient
 * but also carries the normalisation provenance — the original `raw` line and
 * the `source` layer that produced it — so the review UI can show before/after
 * (spec §10 Phase 4.5).
 */
export const DraftIngredientSchema = z.object({
  itemName: z.string(),
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
  isStaple: z.boolean(),
  baseUnit: z.string().nullable(),
  typicalUnitGrams: z.number().positive().nullable(),
  /** The original free-text line, for before/after review. */
  raw: z.string(),
  /** Which normalisation layer produced this line. */
  source: z.enum(NORMALISER_STRATEGIES),
})
export type DraftIngredient = z.infer<typeof DraftIngredientSchema>

/**
 * Draft a URL import produces. It mirrors the create payload so the frontend can
 * review/edit it in the recipe form before saving — nothing is persisted yet.
 * `warnings` surfaces any normalisation fallbacks (e.g. LLM unreachable).
 */
export const ImportedRecipeDraftSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sourceUrl: z.string(),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  servings: z.number().int(),
  ingredients: z.array(DraftIngredientSchema),
  steps: z.array(z.object({ text: z.string() })),
  /** Normalisation strategy that ran, and any fallback notices. */
  normaliser: z.enum(NORMALISER_STRATEGIES),
  warnings: z.array(z.string()),
})
export type ImportedRecipeDraft = z.infer<typeof ImportedRecipeDraftSchema>
