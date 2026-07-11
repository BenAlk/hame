import type { Prisma } from '@prisma/client'
import type {
  CreateRecipeInput,
  ImportedRecipeDraft,
  Recipe,
  RecipeIngredient,
  RecipeIngredientInput,
  RecipeSummary,
  UpdateRecipeInput,
} from '@hame/shared'
import { baseUnitOf } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { itemInclude, findOrCreateItemByName, toItem } from './item.service.js'
import { toTag } from './tag.service.js'
import { importRecipeFromUrl } from '../integrations/recipe-import/index.js'
import { getNormaliser } from './normaliser.service.js'

const ingredientInclude = { item: { include: itemInclude } } as const

const recipeInclude = {
  ingredients: { include: ingredientInclude, orderBy: { order: 'asc' } },
  steps: { orderBy: { order: 'asc' } },
  tags: { orderBy: { name: 'asc' } },
} as const satisfies Prisma.RecipeInclude

const summaryInclude = { tags: { orderBy: { name: 'asc' } } } as const

type IngredientRow = Prisma.RecipeIngredientGetPayload<{ include: typeof ingredientInclude }>
type RecipeRow = Prisma.RecipeGetPayload<{ include: typeof recipeInclude }>
type SummaryRow = Prisma.RecipeGetPayload<{ include: typeof summaryInclude }>

function toRecipeIngredient(row: IngredientRow): RecipeIngredient {
  return {
    id: row.id,
    item: toItem(row.item),
    quantity: row.quantity,
    unit: row.unit,
    notes: row.notes,
    optional: row.optional,
    order: row.order,
  }
}

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    sourceUrl: row.sourceUrl,
    prepTimeMinutes: row.prepTimeMinutes,
    cookTimeMinutes: row.cookTimeMinutes,
    servings: row.servings,
    ingredients: row.ingredients.map(toRecipeIngredient),
    steps: row.steps.map((s) => ({ id: s.id, order: s.order, text: s.text })),
    tags: row.tags.map(toTag),
    mealTypes: row.mealTypes,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toRecipeSummary(row: SummaryRow): RecipeSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    prepTimeMinutes: row.prepTimeMinutes,
    cookTimeMinutes: row.cookTimeMinutes,
    servings: row.servings,
    tags: row.tags.map(toTag),
    mealTypes: row.mealTypes,
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listRecipes(opts: { search?: string } = {}): Promise<RecipeSummary[]> {
  const recipes = await prisma.recipe.findMany({
    where: opts.search
      ? {
          OR: [
            { title: { contains: opts.search, mode: 'insensitive' } },
            { tags: { some: { name: { contains: opts.search, mode: 'insensitive' } } } },
          ],
        }
      : undefined,
    include: summaryInclude,
    orderBy: { title: 'asc' },
  })
  return recipes.map(toRecipeSummary)
}

export async function getRecipe(id: string): Promise<Recipe> {
  const recipe = await prisma.recipe.findUnique({ where: { id }, include: recipeInclude })
  if (!recipe) throw HttpError.notFound('Recipe not found')
  return toRecipe(recipe)
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createRecipe(input: CreateRecipeInput, userId: string): Promise<Recipe> {
  await assertTagsExist(input.tagIds)
  const ingredients = await resolveIngredients(input.ingredients, userId)

  const recipe = await prisma.recipe.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      sourceUrl: input.sourceUrl ?? null,
      prepTimeMinutes: input.prepTimeMinutes ?? null,
      cookTimeMinutes: input.cookTimeMinutes ?? null,
      servings: input.servings,
      mealTypes: input.mealTypes ?? [],
      createdById: userId,
      ingredients: { create: ingredients },
      steps: { create: input.steps.map((s, order) => ({ text: s.text, order })) },
      ...(input.tagIds && { tags: { connect: input.tagIds.map((id) => ({ id })) } }),
    },
  })
  return getRecipe(recipe.id)
}

export async function updateRecipe(id: string, input: UpdateRecipeInput): Promise<Recipe> {
  const existing = await prisma.recipe.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Recipe not found')
  await assertTagsExist(input.tagIds)

  // Ingredients/steps are value-objects of the recipe: replace them wholesale
  // (within a transaction) when provided rather than diffing individual rows.
  const ingredients =
    input.ingredients !== undefined
      ? await resolveIngredients(input.ingredients, existing.createdById)
      : null

  await prisma.$transaction(async (tx) => {
    await tx.recipe.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.sourceUrl !== undefined && { sourceUrl: input.sourceUrl }),
        ...(input.prepTimeMinutes !== undefined && { prepTimeMinutes: input.prepTimeMinutes }),
        ...(input.cookTimeMinutes !== undefined && { cookTimeMinutes: input.cookTimeMinutes }),
        ...(input.servings !== undefined && { servings: input.servings }),
        ...(input.mealTypes !== undefined && { mealTypes: { set: input.mealTypes } }),
        ...(input.tagIds && { tags: { set: input.tagIds.map((tid) => ({ id: tid })) } }),
      },
    })
    if (ingredients) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } })
      await tx.recipeIngredient.createMany({
        data: ingredients.map((ing) => ({ ...ing, recipeId: id })),
      })
    }
    if (input.steps !== undefined) {
      await tx.recipeStep.deleteMany({ where: { recipeId: id } })
      await tx.recipeStep.createMany({
        data: input.steps.map((s, order) => ({ recipeId: id, text: s.text, order })),
      })
    }
  })

  return getRecipe(id)
}

export async function deleteRecipe(id: string): Promise<void> {
  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: { _count: { select: { mealEntries: true } } },
  })
  if (!recipe) throw HttpError.notFound('Recipe not found')
  if (recipe._count.mealEntries > 0) {
    throw HttpError.conflict('This recipe is used in the meal plan — remove those entries first')
  }
  await prisma.recipe.delete({ where: { id } }) // ingredients + steps cascade
}

/** Import a recipe draft from a URL (spec §8.5) — not persisted until saved. */
export async function importRecipe(url: string): Promise<ImportedRecipeDraft> {
  const normaliser = await getNormaliser()
  return importRecipeFromUrl(url, normaliser)
}

// ── internals ──────────────────────────────────────────────────────────────

/**
 * Choose the canonical base unit for a freshly minted Item (spec §9.2, §10
 * Phase 4.5). Priority:
 *   1. the display unit's family, when it's a known measure ("tbsp" → ml), so
 *      display and base always agree and generate-shopping-list can total it;
 *   2. for a bare count with no display unit ("8 chicken breasts"), `unit` —
 *      a discrete countable item, not the dictionary's weight hint;
 *   3. the normalisation hint, for a bulk item written without a unit
 *      ("200 flour" → g);
 *   4. `null` when there's nothing to go on.
 */
function deriveItemBaseUnit(ing: RecipeIngredientInput): string | null {
  const fromUnit = ing.unit ? baseUnitOf(ing.unit) : null
  if (fromUnit) return fromUnit
  if (!ing.unit && ing.quantity != null) {
    // A discrete countable item (has a typical unit weight), or one with no
    // weight hint at all, is counted by the unit; only a genuine weight/volume
    // hint keeps its measure.
    if (ing.typicalUnitGrams != null) return 'unit'
    return ing.baseUnit ?? 'unit'
  }
  return ing.baseUnit ?? null
}

/**
 * Turn ingredient inputs into `RecipeIngredient` create rows, resolving each to
 * a linked Item (spec §9.2). New items minted by name infer their base unit from
 * the ingredient's display unit so stock maths works out of the box.
 */
async function resolveIngredients(
  inputs: RecipeIngredientInput[],
  userId: string,
): Promise<
  {
    itemId: string
    quantity: number | null
    unit: string | null
    notes: string | null
    optional: boolean
    order: number
  }[]
> {
  const resolved = []
  for (const [order, ing] of inputs.entries()) {
    const itemId =
      ing.itemId ??
      (await findOrCreateItemByName(ing.itemName!, userId, {
        baseUnit: deriveItemBaseUnit(ing),
        isStaple: ing.isStaple ?? false,
        typicalUnitGrams: ing.typicalUnitGrams ?? null,
      }))
    resolved.push({
      itemId,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      notes: ing.notes ?? null,
      optional: ing.optional ?? false,
      order,
    })
  }

  // Validate any explicitly-referenced items exist before writing.
  const explicitIds = inputs.filter((i) => i.itemId).map((i) => i.itemId!)
  if (explicitIds.length > 0) {
    const found = await prisma.item.count({ where: { id: { in: explicitIds } } })
    if (found !== new Set(explicitIds).size) throw HttpError.badRequest('Unknown ingredient item')
  }
  return resolved
}

async function assertTagsExist(tagIds?: string[]): Promise<void> {
  if (tagIds && tagIds.length > 0) {
    const found = await prisma.tag.count({ where: { id: { in: tagIds } } })
    if (found !== new Set(tagIds).size) throw HttpError.badRequest('Unknown tag')
  }
}
