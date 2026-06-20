import { z } from 'zod'
import { DEFAULT_OLLAMA_MODEL } from '../constants/index.js'

/**
 * Ollama connection settings for the `LLM` ingredient normaliser (spec §10
 * Phase 4.5, §12). A singleton mirroring the HomeAssistant/Immich config
 * pattern — URL + model name. Ollama on the homelab is unauthenticated, so
 * there is no secret to encrypt at rest.
 */
export const OllamaConfigSchema = z.object({
  url: z.string().url().nullable(),
  model: z.string(),
  isActive: z.boolean(),
  lastConnectedAt: z.coerce.date().nullable(),
  updatedAt: z.coerce.date(),
})
export type OllamaConfig = z.infer<typeof OllamaConfigSchema>

export const UpdateOllamaConfigSchema = z.object({
  url: z.string().url('Enter a valid URL').max(300),
  model: z.string().min(1, 'Model name is required').max(120).default(DEFAULT_OLLAMA_MODEL),
  isActive: z.boolean().optional(),
})
export type UpdateOllamaConfigInput = z.infer<typeof UpdateOllamaConfigSchema>

/** Probe an Ollama URL for its installed models — works before saving config. */
export const ProbeOllamaSchema = z.object({
  url: z.string().url('Enter a valid URL').max(300),
})
export type ProbeOllamaInput = z.infer<typeof ProbeOllamaSchema>

/** Result of probing an Ollama server: reachability + the models it reports. */
export const OllamaTestResultSchema = z.object({
  ok: z.boolean(),
  /** Models the server reports, when reachable. */
  models: z.array(z.string()),
  message: z.string(),
})
export type OllamaTestResult = z.infer<typeof OllamaTestResultSchema>
