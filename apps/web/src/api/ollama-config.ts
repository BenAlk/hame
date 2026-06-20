import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  OllamaConfig,
  OllamaTestResult,
  ProbeOllamaInput,
  UpdateOllamaConfigInput,
} from '@hame/shared'
import { apiFetch } from './client'

const OLLAMA_KEY = ['ollama-config'] as const

/** Admin-only: the Ollama connection for the LLM ingredient normaliser. */
export function useOllamaConfig(enabled = true) {
  return useQuery<OllamaConfig>({
    queryKey: OLLAMA_KEY,
    queryFn: () => apiFetch<OllamaConfig>('/api/ollama-config'),
    enabled,
  })
}

export function useUpdateOllamaConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateOllamaConfigInput) =>
      apiFetch<OllamaConfig>('/api/ollama-config', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => qc.setQueryData(OLLAMA_KEY, data),
  })
}

/** Probe a (possibly unsaved) URL for its installed models — drives the dropdown. */
export function useProbeOllamaModels() {
  return useMutation({
    mutationFn: (body: ProbeOllamaInput) =>
      apiFetch<OllamaTestResult>('/api/ollama-config/models', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}
