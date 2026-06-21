import { z } from 'zod'
import { MEAL_TYPES, NORMALISER_STRATEGIES } from '../constants/index.js'
import { MemberSummarySchema } from './user.js'
import { RecipeSummarySchema } from './recipe.js'
import { ShoppingListSchema } from './shopping.js'

const atLeastOneField = (data: Record<string, unknown>) => Object.keys(data).length > 0
const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

export const MealTypeSchema = z.enum(MEAL_TYPES)

// ── Meal plan entries ────────────────────────────────────────────────────────

/** Fields shared by create and update. An entry is a recipe OR a custom label. */
const MealPlanEntryFields = z.object({
  date: z.coerce.date(),
  mealType: MealTypeSchema,
  recipeId: z.string().uuid().nullish(),
  customLabel: z.string().min(1).max(80).nullish(), // "Takeaway", "Leftovers"
  servings: z.number().int().positive().max(100).nullish(), // overrides recipe default
  notes: z.string().max(500).nullish(),
})

type MealPlanEntryShape = Partial<z.infer<typeof MealPlanEntryFields>>

/**
 * An entry must resolve to something to cook: either a linked recipe or a
 * free-text label. Skipped on partial updates that touch neither field.
 */
function refineEntry(data: MealPlanEntryShape, ctx: z.RefinementCtx) {
  const hasRecipe = data.recipeId != null
  const hasLabel = data.customLabel != null && data.customLabel !== ''
  if ('recipeId' in data || 'customLabel' in data) {
    if (!hasRecipe && !hasLabel)
      ctx.addIssue({
        code: 'custom',
        path: ['recipeId'],
        message: 'Pick a recipe or enter a custom label',
      })
  }
}

export const CreateMealPlanEntrySchema = MealPlanEntryFields.superRefine(refineEntry)
export type CreateMealPlanEntryInput = z.infer<typeof CreateMealPlanEntrySchema>

export const UpdateMealPlanEntrySchema = MealPlanEntryFields.partial()
  .superRefine(refineEntry)
  .refine(atLeastOneField, atLeastOneFieldMessage)
export type UpdateMealPlanEntryInput = z.infer<typeof UpdateMealPlanEntrySchema>

export const MealPlanEntrySchema = z.object({
  id: z.string().uuid(),
  date: z.coerce.date(),
  mealType: MealTypeSchema,
  recipe: RecipeSummarySchema.nullable(),
  customLabel: z.string().nullable(),
  servings: z.number().nullable(),
  notes: z.string().nullable(),
  createdBy: MemberSummarySchema,
  createdAt: z.coerce.date(),
})
export type MealPlanEntry = z.infer<typeof MealPlanEntrySchema>

// ── Generate shopping list (spec §8.6) ───────────────────────────────────────

/** Aggregate a date range's meal-plan ingredients into a new shopping list. */
export const GenerateShoppingListSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    listName: z.string().min(1).max(60).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    path: ['endDate'],
    message: 'End date must be on or after the start date',
  })
export type GenerateShoppingListInput = z.infer<typeof GenerateShoppingListSchema>

/**
 * Outcome of a generate run: the created list (null when nothing was short) plus
 * human-readable warnings for ingredients that couldn't be summed — e.g. a unit
 * that doesn't convert to the item's base unit (spec §9.2).
 */
export const GenerateShoppingListResultSchema = z.object({
  list: ShoppingListSchema.nullable(),
  warnings: z.array(z.string()),
})
export type GenerateShoppingListResult = z.infer<typeof GenerateShoppingListResultSchema>

// ── Household settings (spec §7.5) ───────────────────────────────────────────

export const NormaliserStrategySchema = z.enum(NORMALISER_STRATEGIES)

/** Household-wide settings: meal-plan UI + ingredient-normalisation strategy. */
export const HouseholdSettingsSchema = z.object({
  enabledMealTypes: z.array(MealTypeSchema),
  /** Which ingredient-normalisation layer runs on import (spec §10 Phase 4.5). */
  ingredientNormaliser: NormaliserStrategySchema,
  /** Whether the calendar is served over CalDAV (spec §10 Phase 5.5). */
  caldavEnabled: z.boolean(),
  updatedAt: z.coerce.date(),
})
export type HouseholdSettings = z.infer<typeof HouseholdSettingsSchema>

export const UpdateHouseholdSettingsSchema = z
  .object({
    enabledMealTypes: z.array(MealTypeSchema).min(1, 'Enable at least one meal type'),
    ingredientNormaliser: NormaliserStrategySchema,
    caldavEnabled: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' })
export type UpdateHouseholdSettingsInput = z.infer<typeof UpdateHouseholdSettingsSchema>
