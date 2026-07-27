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
import type { RecipeExtractor } from '../integrations/recipe-import/index.js'
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

/**
 * The recipe extractor to fall back on when a page carries no structured data
 * (spec §8.5), or null when the household isn't running a model. Bound to the
 * same configured Ollama the normaliser uses, so the fallback exists exactly
 * when there is something to run it on.
 */
export async function getRecipeExtractor(): Promise<RecipeExtractor | null> {
  const llm = await getLlm()
  return llm ? (pageText) => llm.extractRecipe(pageText) : null
}

/**
 * The configured Ollama normaliser, or null when the household isn't running
 * one. For the jobs that are *only* worth doing with a model — tag suggestion,
 * product canonicalisation — where there is no deterministic layer to fall back
 * to and the caller simply does without.
 */
export async function getLlm(): Promise<LlmNormaliser | null> {
  const normaliser = await getNormaliser()
  return normaliser instanceof LlmNormaliser ? normaliser : null
}

/**
 * Preload the configured normaliser's model, if any (spec §10 Phase 4.5). Only
 * the LLM strategy has anything to warm; every other strategy is a no-op. Used
 * to overlap Ollama's cold model-load with the user's recipe-import think-time.
 * Returns once the warm-up has been *kicked off* — the preload itself runs
 * fire-and-forget and reports nothing back.
 */
export async function warmUpNormaliser(): Promise<void> {
  const normaliser = await getNormaliser()
  if (normaliser instanceof LlmNormaliser) void normaliser.warmUp()
}
