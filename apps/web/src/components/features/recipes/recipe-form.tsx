import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CreateRecipeInput, Recipe, RecipeIngredientInput, Tag } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Editable ingredient row in the form (strings for numeric inputs). */
interface IngredientRow {
  itemName: string
  quantity: string
  unit: string
  notes: string
  optional: boolean
  /** Carried through from URL import; staples are kept off generated lists. */
  isStaple: boolean
}

export interface RecipeFormInitial {
  title?: string
  description?: string | null
  imageUrl?: string | null
  sourceUrl?: string | null
  prepTimeMinutes?: number | null
  cookTimeMinutes?: number | null
  servings?: number
  ingredients?: IngredientRow[]
  steps?: string[]
  tagIds?: string[]
}

interface RecipeFormProps {
  /** Existing recipe (edit) — takes precedence over `initial`. */
  recipe?: Recipe
  /** Seed values, e.g. from a URL import draft (create only). */
  initial?: RecipeFormInitial
  tags: Tag[]
  onSubmit: (input: CreateRecipeInput) => void
  onCancel: () => void
  submitting?: boolean
  error?: string | null
}

function emptyIngredient(): IngredientRow {
  return { itemName: '', quantity: '', unit: '', notes: '', optional: false, isStaple: false }
}

function recipeToRows(recipe: Recipe): IngredientRow[] {
  return recipe.ingredients.map((ing) => ({
    itemName: ing.item.name,
    quantity: ing.quantity == null ? '' : String(ing.quantity),
    unit: ing.unit ?? '',
    notes: ing.notes ?? '',
    optional: ing.optional,
    isStaple: ing.item.isStaple,
  }))
}

/** Create/edit form for a recipe with dynamic ingredient and step rows. */
export function RecipeForm({
  recipe,
  initial,
  tags,
  onSubmit,
  onCancel,
  submitting,
  error,
}: RecipeFormProps) {
  const seed = recipe ?? initial
  const [title, setTitle] = useState(seed?.title ?? '')
  const [description, setDescription] = useState(seed?.description ?? '')
  const [imageUrl, setImageUrl] = useState(seed?.imageUrl ?? '')
  // Source URL is only ever set by import; carried through, not user-edited.
  const sourceUrl = seed?.sourceUrl ?? ''
  const [prepTime, setPrepTime] = useState(
    seed?.prepTimeMinutes == null ? '' : String(seed.prepTimeMinutes),
  )
  const [cookTime, setCookTime] = useState(
    seed?.cookTimeMinutes == null ? '' : String(seed.cookTimeMinutes),
  )
  const [servings, setServings] = useState(String(seed?.servings ?? 4))
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    recipe
      ? recipeToRows(recipe)
      : initial?.ingredients && initial.ingredients.length > 0
        ? initial.ingredients
        : [emptyIngredient()],
  )
  const [steps, setSteps] = useState<string[]>(
    recipe ? recipe.steps.map((s) => s.text) : (initial?.steps ?? ['']),
  )
  const [tagIds, setTagIds] = useState<Set<string>>(
    new Set(recipe ? recipe.tags.map((t) => t.id) : (initial?.tagIds ?? [])),
  )
  const [localError, setLocalError] = useState<string | null>(null)

  function updateIngredient(index: number, patch: Partial<IngredientRow>) {
    setIngredients((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!title.trim()) return setLocalError('Give the recipe a title.')
    if (!(Number(servings) > 0)) return setLocalError('Servings must be at least one.')

    const cleanIngredients: RecipeIngredientInput[] = ingredients
      .filter((r) => r.itemName.trim())
      .map((r) => ({
        itemName: r.itemName.trim(),
        quantity: r.quantity.trim() ? Number(r.quantity) : null,
        unit: r.unit.trim() || null,
        notes: r.notes.trim() || null,
        optional: r.optional,
        isStaple: r.isStaple,
      }))
    if (cleanIngredients.length === 0) return setLocalError('Add at least one ingredient.')
    if (cleanIngredients.some((r) => r.quantity != null && !(r.quantity > 0)))
      return setLocalError('Ingredient quantities must be positive (or left blank).')

    const cleanSteps = steps.map((t) => t.trim()).filter(Boolean)

    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      imageUrl: imageUrl.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
      prepTimeMinutes: prepTime.trim() ? Number(prepTime) : null,
      cookTimeMinutes: cookTime.trim() ? Number(cookTime) : null,
      servings: Number(servings),
      ingredients: cleanIngredients,
      steps: cleanSteps.map((text) => ({ text })),
      tagIds: [...tagIds],
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipe-title">Title</Label>
        <Input
          id="recipe-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Spaghetti bolognese"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipe-desc">Description</Label>
        <Input
          id="recipe-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipe-image">Image URL</Label>
        <Input
          id="recipe-image"
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="Optional"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recipe-prep">Prep (min)</Label>
          <Input
            id="recipe-prep"
            type="number"
            min="0"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recipe-cook">Cook (min)</Label>
          <Input
            id="recipe-cook"
            type="number"
            min="0"
            value={cookTime}
            onChange={(e) => setCookTime(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recipe-servings">Servings</Label>
          <Input
            id="recipe-servings"
            type="number"
            min="1"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </div>
      </div>

      {/* Ingredients */}
      <div className="flex flex-col gap-2">
        <Label>Ingredients</Label>
        {ingredients.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              aria-label={`Ingredient ${i + 1} quantity`}
              value={row.quantity}
              onChange={(e) => updateIngredient(i, { quantity: e.target.value })}
              placeholder="200"
              className="w-16 shrink-0"
            />
            <Input
              aria-label={`Ingredient ${i + 1} unit`}
              value={row.unit}
              onChange={(e) => updateIngredient(i, { unit: e.target.value })}
              placeholder="g"
              className="w-16 shrink-0"
            />
            <Input
              aria-label={`Ingredient ${i + 1} name`}
              value={row.itemName}
              onChange={(e) => updateIngredient(i, { itemName: e.target.value })}
              placeholder="plain flour"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setIngredients((rows) => rows.filter((_, idx) => idx !== i))}
              aria-label={`Remove ingredient ${i + 1}`}
              className="shrink-0 rounded-control p-2 text-muted-foreground hover:bg-muted hover:text-warning"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setIngredients((rows) => [...rows, emptyIngredient()])}
        >
          <Plus className="size-4" />
          Add ingredient
        </Button>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-2">
        <Label>Method</Label>
        {steps.map((text, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="mt-2.5 w-5 shrink-0 text-right text-sm text-muted-foreground">
              {i + 1}.
            </span>
            <textarea
              aria-label={`Step ${i + 1}`}
              value={text}
              onChange={(e) => setSteps((s) => s.map((t, idx) => (idx === i ? e.target.value : t)))}
              placeholder="Describe this step…"
              rows={2}
              className="flex-1 rounded-control border border-input bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))}
              aria-label={`Remove step ${i + 1}`}
              className="mt-1 shrink-0 rounded-control p-2 text-muted-foreground hover:bg-muted hover:text-warning"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setSteps((s) => [...s, ''])}
        >
          <Plus className="size-4" />
          Add step
        </Button>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  setTagIds((s) => {
                    const next = new Set(s)
                    if (next.has(tag.id)) next.delete(tag.id)
                    else next.add(tag.id)
                    return next
                  })
                }
                aria-pressed={tagIds.has(tag.id)}
                className={cn(
                  'rounded-pill border px-3 py-1 text-sm font-medium transition-colors',
                  tagIds.has(tag.id)
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-muted-foreground hover:border-accent',
                )}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {(localError ?? error) && <p className="text-sm text-warning">{localError ?? error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {recipe ? 'Save changes' : 'Create recipe'}
        </Button>
      </div>
    </form>
  )
}
