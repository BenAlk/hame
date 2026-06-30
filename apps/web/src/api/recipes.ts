import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateRecipeInput,
  ImportedRecipeDraft,
  ImportRecipeInput,
  Recipe,
  RecipeSummary,
  UpdateRecipeInput,
} from '@hame/shared'
import { apiFetch } from './client'
import { toast } from '@/stores/toast'

const RECIPES_KEY = ['recipes'] as const

/** Editing a recipe ripples into items (newly minted ingredients) and meal plans. */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: RECIPES_KEY })
  void qc.invalidateQueries({ queryKey: ['items'] })
  void qc.invalidateQueries({ queryKey: ['meal-plans'] })
}

export function useRecipes(search?: string) {
  return useQuery<RecipeSummary[]>({
    queryKey: [...RECIPES_KEY, { search: search ?? '' }],
    queryFn: () =>
      apiFetch<RecipeSummary[]>(
        `/api/recipes${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
  })
}

export function useRecipe(id: string | undefined) {
  return useQuery<Recipe>({
    queryKey: [...RECIPES_KEY, id],
    queryFn: () => apiFetch<Recipe>(`/api/recipes/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateRecipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateRecipeInput) =>
      apiFetch<Recipe>('/api/recipes', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUpdateRecipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateRecipeInput & { id: string }) =>
      apiFetch<Recipe>(`/api/recipes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteRecipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Recipe deleted.')
    },
  })
}

/**
 * Preload the import normaliser's model (a no-op unless the household runs the
 * LLM strategy). Fire-and-forget — call it when the import modal opens so
 * Ollama's cold model-load overlaps with the user typing a URL. Failures are
 * irrelevant; the import itself degrades gracefully either way.
 */
export function warmUpImport() {
  void apiFetch('/api/recipes/import/warmup', { method: 'POST' }).catch(() => {})
}

/** Import a recipe draft from a URL — returns an editable draft, persists nothing. */
export function useImportRecipe() {
  return useMutation({
    mutationFn: (body: ImportRecipeInput) =>
      apiFetch<ImportedRecipeDraft>('/api/recipes/import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}
