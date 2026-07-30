import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateItemInput,
  Item,
  SuggestSectionInput,
  SuggestTagsInput,
  SuggestedSection,
  SuggestedTags,
  UpdateItemInput,
} from '@hame/shared'
import { apiFetch } from './client'

const ITEMS_KEY = ['items'] as const

/** All items, or only `quick-add`-tagged items when `quickAdd` is true. */
export function useItems(opts: { quickAdd?: boolean } = {}) {
  const path = opts.quickAdd ? '/api/items?quickAdd=true' : '/api/items'
  return useQuery<Item[]>({
    queryKey: [...ITEMS_KEY, { quickAdd: opts.quickAdd ?? false }],
    queryFn: () => apiFetch<Item[]>(path),
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateItemInput) =>
      apiFetch<Item>('/api/items', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY }),
  })
}

/** Items are embedded in pantry entries and shopping lines, so those refresh too. */
export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateItemInput & { id: string }) =>
      apiFetch<Item>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ITEMS_KEY })
      void qc.invalidateQueries({ queryKey: ['pantry'] })
      void qc.invalidateQueries({ queryKey: ['shopping-lists'] })
    },
  })
}

/**
 * Ask the model for tags, drawn from the household's existing pool (spec §12).
 * A mutation rather than a query because it takes a bare **name**, so it also
 * answers for an item that doesn't exist yet — there is no id to key a cache on,
 * and the answer is wanted on demand rather than on render.
 */
export function useSuggestTags() {
  return useMutation({
    mutationFn: (body: SuggestTagsInput) =>
      apiFetch<SuggestedTags>('/api/items/suggest-tags', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}

/**
 * Ask the model which section an item belongs in (spec §8.3). A mutation for the
 * same reason as {@link useSuggestTags}: it keys on a name, not an id, so it also
 * answers for an item that doesn't exist yet.
 */
export function useSuggestSection() {
  return useMutation({
    mutationFn: (body: SuggestSectionInput) =>
      apiFetch<SuggestedSection>('/api/items/suggest-section', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}

/**
 * Preload the model behind the suggest affordances (a no-op unless the household
 * runs the LLM strategy). Fire-and-forget — call it when a page carrying one
 * mounts, so Ollama's cold model-load overlaps with the user reading the page
 * rather than swallowing their first tap. Failures are irrelevant: suggestion
 * degrades gracefully either way.
 */
export function warmUpSuggestions() {
  void apiFetch('/api/items/warm-suggestions', { method: 'POST' }).catch(() => {})
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY }),
  })
}
