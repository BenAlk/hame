import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

const getHouseholdSettings = vi.fn()
const getOllamaConfig = vi.fn()
vi.mock('../services/household-settings.service.js', () => ({ getHouseholdSettings }))
vi.mock('../services/ollama-config.service.js', () => ({ getOllamaConfig }))

const { getNormaliser } = await import('../services/normaliser.service.js')

beforeEach(() => {
  vi.clearAllMocks()
  getOllamaConfig.mockResolvedValue({ url: null, model: 'llama3.1', isActive: false })
})

describe('getNormaliser', () => {
  it('returns the basic normaliser for BASIC', async () => {
    getHouseholdSettings.mockResolvedValue({ ingredientNormaliser: 'BASIC' })
    expect((await getNormaliser()).strategy).toBe('BASIC')
  })

  it('returns the dictionary normaliser for DICTIONARY', async () => {
    getHouseholdSettings.mockResolvedValue({ ingredientNormaliser: 'DICTIONARY' })
    expect((await getNormaliser()).strategy).toBe('DICTIONARY')
  })

  it('uses the LLM normaliser when LLM is chosen and Ollama is active', async () => {
    getHouseholdSettings.mockResolvedValue({ ingredientNormaliser: 'LLM' })
    getOllamaConfig.mockResolvedValue({
      url: 'http://ollama.test',
      model: 'llama3.1',
      isActive: true,
    })
    expect((await getNormaliser()).strategy).toBe('LLM')
  })

  it('falls back to the dictionary when LLM is chosen but Ollama is not set up', async () => {
    getHouseholdSettings.mockResolvedValue({ ingredientNormaliser: 'LLM' })
    expect((await getNormaliser()).strategy).toBe('DICTIONARY')
  })
})
