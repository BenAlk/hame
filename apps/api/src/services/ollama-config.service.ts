import type { OllamaConfig, OllamaTestResult, UpdateOllamaConfigInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { fetchOllamaModels } from '../integrations/ollama/index.js'

/** The Ollama config row is a singleton (spec §10 Phase 4.5), keyed by this id. */
const SINGLETON_ID = 'singleton'

function toConfig(row: {
  url: string | null
  model: string
  isActive: boolean
  lastConnectedAt: Date | null
  updatedAt: Date
}): OllamaConfig {
  return {
    url: row.url,
    model: row.model,
    isActive: row.isActive,
    lastConnectedAt: row.lastConnectedAt,
    updatedAt: row.updatedAt,
  }
}

/** Fetch the Ollama config, creating the default (inactive) row on first access. */
export async function getOllamaConfig(): Promise<OllamaConfig> {
  const row = await prisma.ollamaConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
  return toConfig(row)
}

export async function updateOllamaConfig(input: UpdateOllamaConfigInput): Promise<OllamaConfig> {
  const row = await prisma.ollamaConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {
      url: input.url,
      model: input.model,
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    create: {
      id: SINGLETON_ID,
      url: input.url,
      model: input.model,
      isActive: input.isActive ?? false,
    },
  })
  return toConfig(row)
}

/**
 * Probe an Ollama URL for its installed models — works against the URL the user
 * has just typed, so the settings UI can discover models on blur without first
 * saving. If the probe succeeds against the URL already saved as active, stamp
 * `lastConnectedAt` as a side effect.
 */
export async function probeOllamaModels(url: string): Promise<OllamaTestResult> {
  try {
    const models = await fetchOllamaModels(url)
    // Reflect a successful probe of the live config on the saved row.
    await prisma.ollamaConfig
      .updateMany({ where: { id: SINGLETON_ID, url }, data: { lastConnectedAt: new Date() } })
      .catch(() => undefined)
    return {
      ok: true,
      models,
      message:
        models.length > 0
          ? `Connected — ${models.length} model${models.length === 1 ? '' : 's'} available.`
          : 'Connected, but no models are installed. Run: ollama pull <model>',
    }
  } catch {
    return { ok: false, models: [], message: 'Could not reach Ollama at that URL.' }
  }
}
