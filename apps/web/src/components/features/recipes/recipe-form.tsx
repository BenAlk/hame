import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type {
  CreateRecipeInput,
  MealType,
  Recipe,
  RecipeIngredientInput,
  Tag,
  TagSurface,
} from '@hame/shared'
import { MEAL_TYPES, defaultTagKindFor, tagsForSurface } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ApiError } from '@/api/client'
import { useCreateTag } from '@/api/tags'
import { findTagByName, otherKindNote, tagOfAnotherKind } from '@/lib/tags'

/** A recipe carries recipe vocabulary and dietary claims — never `quick-add` (§10 Phase 24). */
const SURFACE: TagSurface = 'RECIPE'

const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
}

/** Editable ingredient row in the form (strings for numeric inputs). */
interface IngredientRow {
  itemName: string
  quantity: string
  unit: string
  notes: string
  optional: boolean
  /** Carried through from URL import; staples are kept off generated lists. */
  isStaple: boolean
  /** Normalisation hints carried from import for a freshly minted Item (§9.2). */
  baseUnit?: string | null
  typicalUnitGrams?: number | null
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
  mealTypes?: MealType[]
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
  const [mealTypes, setMealTypes] = useState<Set<MealType>>(
    new Set(recipe ? recipe.mealTypes : (initial?.mealTypes ?? [])),
  )
  const [localError, setLocalError] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [tagNote, setTagNote] = useState<string | null>(null)
  // A tag created here is selected at once, but the pool arrives from the parent's
  // query — so hold it locally until that refetch lands, or the chip it was just
  // created as would blink out of existence between the two.
  const [justCreated, setJustCreated] = useState<Tag[]>([])
  const createTag = useCreateTag()

  // A recipe is only offered recipe vocabulary and dietary claims. Before Phase 24
  // this rendered the *whole* pool, so a lasagne could be tagged `ambient`.
  const pool = useMemo(
    () => [...tags, ...justCreated.filter((t) => !tags.some((p) => p.id === t.id))],
    [tags, justCreated],
  )
  const offered = useMemo(() => tagsForSurface(pool, SURFACE), [pool])

  async function onCreateTag() {
    const name = newTag.trim()
    if (!name) return
    setTagNote(null)
    const clash = tagOfAnotherKind(pool, SURFACE, name)
    if (clash) return setTagNote(otherKindNote(clash))
    // Already in the pool under a kind a recipe can carry — select it rather than
    // colliding on the unique name.
    const existing = findTagByName(pool, name)
    if (existing) {
      setTagIds((s) => new Set(s).add(existing.id))
      setNewTag('')
      return
    }
    try {
      const created = await createTag.mutateAsync({ name, kind: defaultTagKindFor(SURFACE) })
      setJustCreated((current) => [...current, created])
      setTagIds((s) => new Set(s).add(created.id))
      setNewTag('')
    } catch (err) {
      setTagNote(err instanceof ApiError ? err.message : 'Could not create that tag.')
    }
  }

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
        // Hints only land on a newly minted item; harmless when one already exists.
        baseUnit: r.baseUnit ?? null,
        typicalUnitGrams: r.typicalUnitGrams ?? null,
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
      mealTypes: [...mealTypes],
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

      {/* Meal slots — which slots the generator may auto-fill with this recipe (§8.6) */}
      <div className="flex flex-col gap-1.5">
        <Label>Meal slots</Label>
        <p className="text-xs text-muted-foreground">
          Which meals this recipe can fill when you generate a plan. Leave empty to keep it out of
          auto-generation.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MEAL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() =>
                setMealTypes((s) => {
                  const next = new Set(s)
                  if (next.has(type)) next.delete(type)
                  else next.add(type)
                  return next
                })
              }
              aria-pressed={mealTypes.has(type)}
              className={cn(
                'rounded-pill border px-3 py-1 text-sm font-medium transition-colors',
                mealTypes.has(type)
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-surface text-muted-foreground hover:border-accent',
              )}
            >
              {MEAL_LABEL[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipe-new-tag">Tags</Label>
        {offered.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {offered.map((tag) => (
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
        )}

        {/* Filtering a pool this form couldn't add to would freeze recipe
            vocabulary at whatever the seed shipped, so it can add to it. */}
        <div className="flex items-center gap-2">
          <Input
            id="recipe-new-tag"
            value={newTag}
            disabled={createTag.isPending}
            autoComplete="off"
            placeholder="New tag…"
            className="max-w-56"
            onChange={(e) => {
              setNewTag(e.target.value)
              setTagNote(null)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              // Enter here adds a tag; it must never submit the recipe.
              e.preventDefault()
              void onCreateTag()
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={createTag.isPending || newTag.trim() === ''}
            onClick={() => void onCreateTag()}
          >
            <Plus className="size-3.5" />
            Add tag
          </Button>
        </div>
        {tagNote && <p className="text-xs text-muted-foreground">{tagNote}</p>}
      </div>

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
