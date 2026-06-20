import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateMealPlanEntryInput,
  GenerateShoppingListInput,
  GenerateShoppingListResult,
  MealPlanEntry,
  UpdateMealPlanEntryInput,
} from '@hame/shared'
import { apiFetch } from './client'

const MEAL_PLANS_KEY = ['meal-plans'] as const

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: MEAL_PLANS_KEY })
}

/** Meal-plan entries between two ISO dates (inclusive) — powers week/month views. */
export function useMealPlan(from: string, to: string) {
  return useQuery<MealPlanEntry[]>({
    queryKey: [...MEAL_PLANS_KEY, { from, to }],
    queryFn: () => apiFetch<MealPlanEntry[]>(`/api/meal-plans?from=${from}&to=${to}`),
  })
}

export function useCreateMealPlanEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateMealPlanEntryInput) =>
      apiFetch<MealPlanEntry>('/api/meal-plans', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateMealPlanEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateMealPlanEntryInput & { id: string }) =>
      apiFetch<MealPlanEntry>(`/api/meal-plans/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteMealPlanEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/meal-plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(qc),
  })
}

/** The killer feature (spec §8.6): aggregate a date range into a shopping list. */
export function useGenerateShoppingList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: GenerateShoppingListInput) =>
      apiFetch<GenerateShoppingListResult>('/api/meal-plans/generate-shopping-list', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shopping-lists'] }),
  })
}
