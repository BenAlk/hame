import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DictionaryNormaliser } from '@hame/shared'

vi.mock('../lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

const { LlmNormaliser, buildNormalisePrompt, parseLlmResponse } =
  await import('../integrations/ollama/index.js')

const settings = { url: 'http://ollama.test', model: 'llama3.1' }

describe('buildNormalisePrompt', () => {
  it('numbers each line and states the base units', () => {
    const prompt = buildNormalisePrompt(['200 g flour', '2 eggs'])
    expect(prompt).toContain('0. 200 g flour')
    expect(prompt).toContain('1. 2 eggs')
    expect(prompt).toContain('g, ml, unit')
  })
})

describe('parseLlmResponse', () => {
  it('parses a well-formed ingredients array', () => {
    const out = parseLlmResponse(
      JSON.stringify({
        ingredients: [
          { index: 0, canonicalName: 'plain flour', quantity: 200, unit: 'g', baseUnit: 'g' },
        ],
      }),
    )
    expect(out).toEqual([
      expect.objectContaining({ index: 0, canonicalName: 'plain flour', baseUnit: 'g' }),
    ])
  })

  it('drops entries without a numeric index and rejects bad base units', () => {
    const out = parseLlmResponse(
      JSON.stringify({ ingredients: [{ canonicalName: 'x' }, { index: 1, baseUnit: 'litres' }] }),
    )
    expect(out).toEqual([expect.objectContaining({ index: 1, baseUnit: undefined })])
  })

  it('returns an empty array for malformed JSON', () => {
    expect(parseLlmResponse('not json {')).toEqual([])
  })
})

describe('LlmNormaliser', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('overrides the fallback with the model output', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            ingredients: [
              { index: 0, canonicalName: 'tinned chickpeas', baseUnit: 'g', isStaple: false },
            ],
          }),
        },
      }),
    } as Response)

    const normaliser = new LlmNormaliser(settings, new DictionaryNormaliser())
    const { ingredients, warnings } = await normaliser.normalise(['1 can chickpeas'])
    expect(ingredients[0]).toMatchObject({
      canonicalName: 'tinned chickpeas',
      baseUnit: 'g',
      source: 'LLM',
    })
    expect(warnings).toEqual([])
  })

  it('keeps the parsed quantity when the model nulls it out', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            ingredients: [
              { index: 0, canonicalName: 'vegetable oil', unit: 'tbsp', quantity: null },
            ],
          }),
        },
      }),
    } as Response)

    const normaliser = new LlmNormaliser(settings, new DictionaryNormaliser())
    const { ingredients } = await normaliser.normalise(['4 tbsp vegetable oil'])
    expect(ingredients[0]).toMatchObject({
      canonicalName: 'vegetable oil',
      quantity: 4, // preserved from the parser, not nulled by the model
      unit: 'tbsp',
      source: 'LLM',
    })
  })

  it('defaults to a quantity of 1 when a line has a unit but no count', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            ingredients: [
              { index: 0, canonicalName: 'coriander leaf', unit: 'unit', quantity: null },
            ],
          }),
        },
      }),
    } as Response)

    const normaliser = new LlmNormaliser(settings, new DictionaryNormaliser())
    const { ingredients } = await normaliser.normalise(['coriander leaves, to serve'])
    expect(ingredients[0]).toMatchObject({
      canonicalName: 'coriander leaf',
      unit: 'unit',
      quantity: 1,
    })
  })

  it('degrades to the fallback with a warning when Ollama is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))

    const normaliser = new LlmNormaliser(settings, new DictionaryNormaliser())
    const { ingredients, warnings } = await normaliser.normalise(['2 onions'])
    // Falls back to the dictionary result, untouched.
    expect(ingredients[0]).toMatchObject({ canonicalName: 'onion', source: 'DICTIONARY' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/language model/i)
  })
})
