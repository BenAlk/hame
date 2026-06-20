/**
 * Ingredient-normaliser factory (spec §10 Phase 4.5).
 *
 * Reads the household's chosen strategy and returns the matching
 * {@link IngredientNormaliser}, assembling the layered stack: Dictionary wraps
 * Basic, and the LLM wraps Dictionary. The `LLM` choice silently degrades to the
 * dictionary when Ollama isn't configured/active, so a misconfigured model never
 * blocks an import — the normaliser itself also degrades per-call at runtime.
 */
import { BasicNormaliser, DictionaryNormaliser, type IngredientNormaliser } from '@hame/shared'
import { LlmNormaliser } from '../integrations/ollama/index.js'
import { getHouseholdSettings } from './household-settings.service.js'
import { getOllamaConfig } from './ollama-config.service.js'

/** Build the normaliser the household has configured. */
export async function getNormaliser(): Promise<IngredientNormaliser> {
  const { ingredientNormaliser } = await getHouseholdSettings()

  if (ingredientNormaliser === 'BASIC') return new BasicNormaliser()
  if (ingredientNormaliser === 'DICTIONARY') return new DictionaryNormaliser()

  // LLM: layer Ollama over the dictionary, but only when it's set up.
  const ollama = await getOllamaConfig()
  if (ollama.isActive && ollama.url) {
    return new LlmNormaliser({ url: ollama.url, model: ollama.model }, new DictionaryNormaliser())
  }
  return new DictionaryNormaliser()
}
