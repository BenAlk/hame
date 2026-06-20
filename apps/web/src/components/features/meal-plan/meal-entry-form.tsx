import { useState } from 'react'
import type { CreateMealPlanEntryInput, MealPlanEntry, MealType, RecipeSummary } from '@hame/shared'
import { MEAL_TYPES } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
}

const selectClass = 'h-10 rounded-control border border-input bg-surface px-2 text-sm text-ink'

interface MealEntryFormProps {
  /** Existing entry (edit) or seeded date/mealType for a new one. */
  entry?: MealPlanEntry
  date: string // ISO yyyy-mm-dd
  mealType: MealType
  enabledMealTypes: MealType[]
  recipes: RecipeSummary[]
  onSubmit: (input: CreateMealPlanEntryInput) => void
  onCancel: () => void
  onDelete?: () => void
  submitting?: boolean
  error?: string | null
}

export function MealEntryForm({
  entry,
  date,
  mealType,
  enabledMealTypes,
  recipes,
  onSubmit,
  onCancel,
  onDelete,
  submitting,
  error,
}: MealEntryFormProps) {
  const [meal, setMeal] = useState<MealType>(entry?.mealType ?? mealType)
  // "recipe" vs "custom" — an entry is one or the other (spec §8.6).
  const [mode, setMode] = useState<'recipe' | 'custom'>(entry?.customLabel ? 'custom' : 'recipe')
  const [recipeId, setRecipeId] = useState(entry?.recipe?.id ?? recipes[0]?.id ?? '')
  const [customLabel, setCustomLabel] = useState(entry?.customLabel ?? '')
  const [servings, setServings] = useState(entry?.servings == null ? '' : String(entry.servings))
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (mode === 'recipe' && !recipeId) return setLocalError('Pick a recipe (or switch to custom).')
    if (mode === 'custom' && !customLabel.trim()) return setLocalError('Enter a label.')

    onSubmit({
      date: new Date(date),
      mealType: meal,
      recipeId: mode === 'recipe' ? recipeId : null,
      customLabel: mode === 'custom' ? customLabel.trim() : null,
      servings: servings.trim() ? Number(servings) : null,
      notes: notes.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meal-type">Meal</Label>
        <select
          id="meal-type"
          value={meal}
          onChange={(e) => setMeal(e.target.value as MealType)}
          className={selectClass}
        >
          {MEAL_TYPES.filter((m) => enabledMealTypes.includes(m) || m === meal).map((m) => (
            <option key={m} value={m}>
              {MEAL_LABEL[m]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1.5">
        <Button
          type="button"
          variant={mode === 'recipe' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('recipe')}
        >
          Recipe
        </Button>
        <Button
          type="button"
          variant={mode === 'custom' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('custom')}
        >
          Custom label
        </Button>
      </div>

      {mode === 'recipe' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meal-recipe">Recipe</Label>
          {recipes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recipes yet — add one first.</p>
          ) : (
            <select
              id="meal-recipe"
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              className={selectClass}
            >
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meal-label">Label</Label>
          <Input
            id="meal-label"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="e.g. Takeaway, Leftovers"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meal-servings">Servings (optional override)</Label>
        <Input
          id="meal-servings"
          type="number"
          min="1"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          placeholder="Defaults to the recipe"
          className="w-44"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meal-notes">Notes</Label>
        <Input
          id="meal-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {(localError ?? error) && <p className="text-sm text-warning">{localError ?? error}</p>}

      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <Button type="button" variant="ghost" onClick={onDelete}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {entry ? 'Save' : 'Add to plan'}
          </Button>
        </div>
      </div>
    </form>
  )
}
