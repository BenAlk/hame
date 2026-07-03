import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AddShoppingItemInput,
  ArchiveShoppingListInput,
  ArchiveShoppingListResult,
  CreateShoppingListInput,
  ListStatus,
  ShoppingList,
  ShoppingListItem,
  UpdateShoppingItemInput,
  UpdateShoppingListInput,
} from '@hame/shared'
import { apiFetch } from './client'
import { toast } from '@/stores/toast'

const CONSUMABLES_ADDED = 'Consumables added to the list.'

const LISTS_KEY = ['shopping-lists'] as const

function invalidateLists(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: LISTS_KEY })
}

export function useShoppingLists(status?: ListStatus) {
  return useQuery<ShoppingList[]>({
    queryKey: [...LISTS_KEY, { status: status ?? 'all' }],
    queryFn: () =>
      apiFetch<ShoppingList[]>(`/api/shopping-lists${status ? `?status=${status}` : ''}`),
  })
}

export function useShoppingList(id: string | undefined) {
  return useQuery<ShoppingList>({
    queryKey: [...LISTS_KEY, id],
    queryFn: () => apiFetch<ShoppingList>(`/api/shopping-lists/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateShoppingList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateShoppingListInput) =>
      apiFetch<ShoppingList>('/api/shopping-lists', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidateLists(qc),
  })
}

export function useUpdateShoppingList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateShoppingListInput & { id: string }) =>
      apiFetch<ShoppingList>(`/api/shopping-lists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateLists(qc),
  })
}

export function useDeleteShoppingList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/shopping-lists/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateLists(qc),
  })
}

export function useArchiveShoppingList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: ArchiveShoppingListInput & { id: string }) =>
      apiFetch<ArchiveShoppingListResult>(`/api/shopping-lists/${id}/archive`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      invalidateLists(qc)
      // Archiving stocks the pantry, so refresh its widgets too.
      void qc.invalidateQueries({ queryKey: ['pantry'] })
      toast.success(
        result.newList
          ? 'List archived — unbought items rolled over to a new list.'
          : 'List archived.',
      )
    },
  })
}

export function useAddShoppingItem(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AddShoppingItemInput) =>
      apiFetch<ShoppingListItem>(`/api/shopping-lists/${listId}/items`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateLists(qc),
  })
}

/** Fold ticked consumables into a list from the "Add consumables" panel (§8.3). */
export function useAddConsumablesToList(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemIds: string[]) =>
      apiFetch<ShoppingList>(`/api/shopping-lists/${listId}/consumables`, {
        method: 'POST',
        body: JSON.stringify({ itemIds }),
      }),
    onSuccess: () => {
      invalidateLists(qc)
      toast.success(CONSUMABLES_ADDED)
    },
  })
}

export function useUpdateShoppingItem(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, ...body }: UpdateShoppingItemInput & { itemId: string }) =>
      apiFetch<ShoppingListItem>(`/api/shopping-lists/${listId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateLists(qc),
  })
}

export function useRemoveShoppingItem(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<void>(`/api/shopping-lists/${listId}/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => invalidateLists(qc),
  })
}
