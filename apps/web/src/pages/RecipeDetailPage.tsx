import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Clock, ExternalLink, Pencil, Trash2, Users } from 'lucide-react'
import type { PublicUser, UpdateRecipeInput } from '@hame/shared'
import { AppNav } from '@/components/app-nav'
import { RecipeForm } from '@/components/features/recipes/recipe-form'
import { TagChip } from '@/components/features/tag-chip'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ApiError } from '@/api/client'
import { useCurrentUser } from '@/api/auth'
import { useTags } from '@/api/tags'
import { useDeleteRecipe, useRecipe, useUpdateRecipe } from '@/api/recipes'
import { quantityLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: me } = useCurrentUser()
  const { data: recipe, isPending } = useRecipe(id)
  const { data: tags } = useTags()
  const updateRecipe = useUpdateRecipe()
  const deleteRecipe = useDeleteRecipe()

  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set())

  async function handleSubmit(input: UpdateRecipeInput) {
    if (!recipe) return
    setError(null)
    try {
      await updateRecipe.mutateAsync({ id: recipe.id, ...input })
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the recipe.')
    }
  }

  async function handleDelete() {
    if (!recipe) return
    if (!window.confirm(`Delete "${recipe.title}"?`)) return
    try {
      await deleteRecipe.mutateAsync(recipe.id)
      navigate('/recipes')
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not delete the recipe.')
    }
  }

  if (isPending) {
    return (
      <main className="container py-10">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    )
  }
  if (!recipe) {
    return (
      <main className="container py-10">
        <p className="text-sm text-muted-foreground">Recipe not found.</p>
        <Link to="/recipes" className="mt-2 inline-block text-sm text-accent hover:underline">
          Back to recipes
        </Link>
      </main>
    )
  }

  const totalTime = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0)

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/recipes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Recipes
        </Link>
        <AppNav user={(me as PublicUser | null) ?? null} />
      </header>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl font-medium text-ink">{recipe.title}</h1>
          {recipe.description && (
            <p className="max-w-prose text-muted-foreground">{recipe.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {totalTime > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" />
                {recipe.prepTimeMinutes ? `${recipe.prepTimeMinutes} prep` : ''}
                {recipe.prepTimeMinutes && recipe.cookTimeMinutes ? ' · ' : ''}
                {recipe.cookTimeMinutes ? `${recipe.cookTimeMinutes} cook` : ''}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" />
              Serves {recipe.servings}
            </span>
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                <ExternalLink className="size-4" />
                Source
              </a>
            )}
          </div>
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <TagChip key={tag.id} tag={tag} />
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void handleDelete()}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[20rem_1fr]">
        {/* Ingredients */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Ingredients
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-ink">
                  {ing.item.name}
                  {ing.optional && <span className="text-muted-foreground"> (optional)</span>}
                  {ing.notes && <span className="text-muted-foreground">, {ing.notes}</span>}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {quantityLabel(ing.quantity, ing.unit) || '—'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Method */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Method
          </h2>
          {recipe.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No method steps recorded.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {recipe.steps.map((step, i) => {
                const done = doneSteps.has(step.id)
                return (
                  <li key={step.id} className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDoneSteps((s) => {
                          const next = new Set(s)
                          if (next.has(step.id)) next.delete(step.id)
                          else next.add(step.id)
                          return next
                        })
                      }
                      aria-pressed={done}
                      aria-label={`Mark step ${i + 1} done`}
                      className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill border text-sm font-medium transition-colors',
                        done
                          ? 'border-accent bg-accent text-white'
                          : 'border-line bg-surface text-muted-foreground hover:border-accent',
                      )}
                    >
                      {done ? <Check className="size-4" /> : i + 1}
                    </button>
                    <p
                      className={cn(
                        'pt-1 text-sm text-ink',
                        done && 'text-muted-foreground line-through',
                      )}
                    >
                      {step.text}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit recipe">
        <RecipeForm
          recipe={recipe}
          tags={tags ?? []}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(false)}
          submitting={updateRecipe.isPending}
          error={error}
        />
      </Modal>
    </main>
  )
}
