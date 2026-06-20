import { describe, it, expect } from 'vitest'
import { parseRecipeJsonLd, parseIsoDuration } from '../integrations/recipe-import/index.js'

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
