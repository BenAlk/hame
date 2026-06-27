import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { CreateRecipeInput, ImportedRecipeDraft } from '@hame/shared'
import { RecipeCard } from '@/components/features/recipes/recipe-card'
import { RecipeForm, type RecipeFormInitial } from '@/components/features/recipes/recipe-form'
import { UrlImport } from '@/components/features/recipes/url-import'
import { NormalisationReview } from '@/components/features/recipes/normalisation-review'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { ApiError } from '@/api/client'
import { useTags } from '@/api/tags'
import { useCreateRecipe, useRecipes, warmUpImport } from '@/api/recipes'

/** Map a URL-import draft into the recipe form's seed shape. */
function draftToInitial(draft: ImportedRecipeDraft): RecipeFormInitial {
  return {
    title: draft.title,
    description: draft.description,
    imageUrl: draft.imageUrl,
    sourceUrl: draft.sourceUrl,
    prepTimeMinutes: draft.prepTimeMinutes,
    cookTimeMinutes: draft.cookTimeMinutes,
    servings: draft.servings,
    ingredients: draft.ingredients.map((ing) => ({
      itemName: ing.itemName,
      quantity: ing.quantity == null ? '' : String(ing.quantity),
      unit: ing.unit ?? '',
      notes: ing.notes ?? '',
      optional: false,
      isStaple: ing.isStaple,
      baseUnit: ing.baseUnit,
      typicalUnitGrams: ing.typicalUnitGrams,
    })),
    steps: draft.steps.map((s) => s.text),
  }
}

export function RecipesPage() {
  const [search, setSearch] = useState('')
  const { data: recipes, isPending } = useRecipes(search.trim() || undefined)
  const { data: tags } = useTags()
  const createRecipe = useCreateRecipe()

  const [formOpen, setFormOpen] = useState(false)
  const [initial, setInitial] = useState<RecipeFormInitial | undefined>(undefined)
  // A freshly imported draft awaiting the user's review before it seeds the form.
  const [reviewDraft, setReviewDraft] = useState<ImportedRecipeDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  function openNew() {
    setInitial(undefined)
    setReviewDraft(null)
    setError(null)
    setFormOpen(true)
    // Warm the LLM normaliser now so its cold-load overlaps with the user
    // pasting a URL (no-op unless the household runs the LLM strategy).
    warmUpImport()
  }

  async function handleSubmit(input: CreateRecipeInput) {
    setError(null)
    try {
      await createRecipe.mutateAsync(input)
      setFormOpen(false)
      setInitial(undefined)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the recipe.')
    }
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Recipes</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openNew}>
          <Plus className="size-4" />
          New recipe
        </Button>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes…"
          className="max-w-xs"
        />
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !recipes || recipes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search.trim() ? 'No recipes match that search.' : 'No recipes yet. Add or import one.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={reviewDraft ? 'Review imported ingredients' : 'New recipe'}
      >
        {reviewDraft ? (
          <NormalisationReview
            draft={reviewDraft}
            onAccept={() => {
              setInitial(draftToInitial(reviewDraft))
              setReviewDraft(null)
            }}
            onDiscard={() => setReviewDraft(null)}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <UrlImport onImported={setReviewDraft} />
            <RecipeForm
              // Remount when a draft arrives so the form re-seeds from it.
              key={initial ? 'imported' : 'blank'}
              initial={initial}
              tags={tags ?? []}
              onSubmit={handleSubmit}
              onCancel={() => setFormOpen(false)}
              submitting={createRecipe.isPending}
              error={error}
            />
          </div>
        )}
      </Modal>
    </main>
  )
}
