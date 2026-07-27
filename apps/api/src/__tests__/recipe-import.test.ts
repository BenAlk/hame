import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BasicNormaliser } from '@hame/shared'

vi.mock('../lib/safe-fetch.js', () => ({ safeFetch: vi.fn() }))

const { safeFetch } = await import('../lib/safe-fetch.js')
const {
  parseRecipeJsonLd,
  parseIsoDuration,
  toPageText,
  focusOnRecipe,
  extractOgImage,
  importRecipeFromUrl,
} = await import('../integrations/recipe-import/index.js')

function pageWith(jsonLd: unknown): string {
  return `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    </head><body>…</body></html>`
}

describe('parseIsoDuration', () => {
  it('converts ISO 8601 durations to minutes', () => {
    expect(parseIsoDuration('PT1H30M')).toBe(90)
    expect(parseIsoDuration('PT20M')).toBe(20)
    expect(parseIsoDuration('PT2H')).toBe(120)
  })
  it('returns null for missing or unparseable values', () => {
    expect(parseIsoDuration(undefined)).toBeNull()
    expect(parseIsoDuration('soon')).toBeNull()
  })
})

describe('parseRecipeJsonLd', () => {
  const recipe = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Test Pancakes',
    description: 'Fluffy.',
    image: ['https://example.com/p.jpg'],
    prepTime: 'PT10M',
    cookTime: 'PT15M',
    recipeYield: '4 servings',
    recipeIngredient: ['200 g plain flour', '2 eggs', 'Salt to taste'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Mix everything.' },
      { '@type': 'HowToStep', text: 'Fry in a pan.' },
    ],
  }

  it('parses a flat Recipe node', () => {
    const draft = parseRecipeJsonLd(pageWith(recipe), 'https://example.com/r')
    expect(draft).not.toBeNull()
    expect(draft).toMatchObject({
      title: 'Test Pancakes',
      sourceUrl: 'https://example.com/r',
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      servings: 4,
      imageUrl: 'https://example.com/p.jpg',
    })
    expect(draft!.ingredients).toHaveLength(3)
    expect(draft!.ingredients[0]).toMatchObject({
      itemName: 'plain flour',
      quantity: 200,
      unit: 'g',
    })
    expect(draft!.ingredients[2].isStaple).toBe(true)
    expect(draft!.steps).toEqual([{ text: 'Mix everything.' }, { text: 'Fry in a pan.' }])
  })

  it('finds a Recipe nested inside an @graph', () => {
    const graph = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, recipe] }
    const draft = parseRecipeJsonLd(pageWith(graph), 'https://example.com/r')
    expect(draft?.title).toBe('Test Pancakes')
  })

  it('handles a @type array including Recipe', () => {
    const draft = parseRecipeJsonLd(
      pageWith({ ...recipe, '@type': ['Thing', 'Recipe'] }),
      'https://example.com/r',
    )
    expect(draft?.title).toBe('Test Pancakes')
  })

  it('returns null when no Recipe is present', () => {
    const draft = parseRecipeJsonLd(pageWith({ '@type': 'WebPage' }), 'https://example.com/r')
    expect(draft).toBeNull()
  })

  it('skips malformed JSON-LD blocks without throwing', () => {
    const html = `<script type="application/ld+json">{ not json </script>${pageWith(recipe)}`
    expect(parseRecipeJsonLd(html, 'https://example.com/r')?.title).toBe('Test Pancakes')
  })
})

describe('toPageText', () => {
  it('drops scripts, styles and page furniture', () => {
    const html = `<html><head><style>.a{color:red}</style></head><body>
      <nav>Home Recipes About</nav>
      <script>window.ads=1</script>
      <h1>Pancakes</h1><p>200g plain flour</p>
      <footer>Copyright</footer></body></html>`
    const text = toPageText(html)
    expect(text).toContain('Pancakes')
    expect(text).toContain('200g plain flour')
    expect(text).not.toMatch(/window\.ads|color:red|Copyright|About/)
  })

  it('keeps block elements on their own lines so ingredients stay separable', () => {
    const text = toPageText('<ul><li>2 eggs</li><li>1 tbsp oil</li></ul>')
    expect(text.split('\n')).toEqual(['2 eggs', '1 tbsp oil'])
  })

  it('decodes the entities that show up in recipe text', () => {
    expect(toPageText('<p>&frac12; tsp salt &amp; pepper</p>')).toBe('½ tsp salt & pepper')
  })
})

describe('focusOnRecipe', () => {
  it('returns short text untouched', () => {
    expect(focusOnRecipe('2 eggs', 100)).toBe('2 eggs')
  })

  it('keeps the recipe rather than the story that precedes it', () => {
    // The shape this exists for: a long personal essay, then the recipe.
    const story = 'When I was a child in Provence, '.repeat(200)
    const text = `${story}\nIngredients\n200g flour\n2 eggs\nMethod\nMix well.`
    const focused = focusOnRecipe(text, 500)
    expect(focused).toContain('200g flour')
    expect(focused).toContain('Mix well.')
    expect(focused.length).toBeLessThanOrEqual(500)
  })

  it('anchors on the last mention, not an early nav or intro one', () => {
    const text = `Ingredients index${'filler '.repeat(200)}Ingredients\n2 eggs\nMethod\nFry.`
    const focused = focusOnRecipe(text, 200)
    expect(focused).toContain('2 eggs')
  })

  it('falls back to the head of the text when there is no anchor', () => {
    const text = 'a'.repeat(500)
    expect(focusOnRecipe(text, 100)).toBe('a'.repeat(100))
  })
})

describe('extractOgImage', () => {
  it('reads an og:image meta tag', () => {
    const html = `<meta property="og:image" content="https://example.com/p.jpg">`
    expect(extractOgImage(html)).toBe('https://example.com/p.jpg')
  })

  it('ignores relative or missing images', () => {
    expect(extractOgImage(`<meta property="og:image" content="/p.jpg">`)).toBeNull()
    expect(extractOgImage('<html></html>')).toBeNull()
  })
})

describe('importRecipeFromUrl — extractor fallback', () => {
  const jsonLdPage = `<html><script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe',
    name: 'Structured Pancakes',
    recipeIngredient: ['2 eggs'],
    recipeInstructions: ['Fry.'],
  })}</script></html>`

  const barePage = `<html><head><meta property="og:image" content="https://example.com/p.jpg">
    </head><body><h1>Gran's Pancakes</h1><p>200g flour</p></body></html>`

  function respondWith(html: string) {
    vi.mocked(safeFetch).mockResolvedValue({ ok: true, text: async () => html } as Response)
  }

  beforeEach(() => {
    vi.mocked(safeFetch).mockReset()
  })

  it('never calls the extractor when the page has structured data', async () => {
    respondWith(jsonLdPage)
    const extractor = vi.fn()
    const draft = await importRecipeFromUrl(
      'https://example.com/r',
      new BasicNormaliser(),
      extractor,
    )
    expect(draft.title).toBe('Structured Pancakes')
    expect(extractor).not.toHaveBeenCalled()
    expect(draft.warnings).toEqual([])
  })

  it('extracts from the page text when there is no structured data', async () => {
    respondWith(barePage)
    const extractor = vi.fn().mockResolvedValue({
      title: "Gran's Pancakes",
      description: null,
      servings: 2,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      ingredientLines: ['200g plain flour', '2 eggs'],
      steps: ['Mix.', 'Fry.'],
    })

    const draft = await importRecipeFromUrl(
      'https://example.com/r',
      new BasicNormaliser(),
      extractor,
    )
    expect(draft.title).toBe("Gran's Pancakes")
    expect(draft.ingredients.map((i) => i.raw)).toEqual(['200g plain flour', '2 eggs'])
    expect(draft.steps).toEqual([{ text: 'Mix.' }, { text: 'Fry.' }])
    // The image is recovered deterministically, not asked of the model.
    expect(draft.imageUrl).toBe('https://example.com/p.jpg')
    // The extractor sees readable text, not markup.
    expect(extractor.mock.calls[0][0]).not.toContain('<h1>')
    // And the draft says out loud that a model read it.
    expect(draft.warnings[0]).toMatch(/no structured recipe data/i)
  })

  it('fails as it did before when no extractor is configured', async () => {
    respondWith(barePage)
    await expect(
      importRecipeFromUrl('https://example.com/r', new BasicNormaliser()),
    ).rejects.toThrow(/No recipe data found/)
  })

  it('fails as it did before when the extractor finds no recipe', async () => {
    respondWith(barePage)
    const extractor = vi.fn().mockResolvedValue(null)
    await expect(
      importRecipeFromUrl('https://example.com/r', new BasicNormaliser(), extractor),
    ).rejects.toThrow(/No recipe data found/)
  })
})
