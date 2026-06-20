/**
 * Bundled ingredient dictionary for the `DICTIONARY` normaliser (spec §10
 * Phase 4.5). Maps common free-text ingredient names onto clean, linkable
 * {@link Item} data — a canonical name, a base unit for stock maths, a typical
 * per-unit weight (so a count like "2 onions" can later become a weight), and a
 * staple flag for things never worth shopping for.
 *
 * Pure data, no dependencies — the `DictionaryNormaliser` runs the regex parser
 * first and only consults this table to enrich/override the result. Unknown
 * items pass straight through untouched.
 *
 * Lookups are by lowercase alias; {@link lookupIngredient} also strips common
 * descriptors ("large", "fresh", "free-range") and a trailing plural before
 * matching, so the table only needs the canonical singular forms.
 */
import type { BaseUnit } from './units.js'

export interface DictionaryEntry {
  /** Clean display name a freshly minted Item should take. */
  canonicalName: string
  /** Canonical unit for stock maths (spec §9.2). */
  baseUnit: BaseUnit
  /** Approx weight in grams of one countable unit (1 onion ≈ 110 g). */
  typicalUnitGrams?: number
  /** Kept for recipe fidelity but never added to a shopping list. */
  isStaple?: boolean
}

/**
 * Canonical entries keyed by their primary name. Aliases are wired up below in
 * {@link INGREDIENT_DICTIONARY}; keep this table to one row per real ingredient.
 */
const ENTRIES = {
  // ── Vegetables (count → typical weight) ────────────────────────────────────
  onion: { canonicalName: 'onion', baseUnit: 'g', typicalUnitGrams: 110 },
  'red onion': { canonicalName: 'red onion', baseUnit: 'g', typicalUnitGrams: 110 },
  'spring onion': { canonicalName: 'spring onion', baseUnit: 'g', typicalUnitGrams: 15 },
  shallot: { canonicalName: 'shallot', baseUnit: 'g', typicalUnitGrams: 30 },
  garlic: { canonicalName: 'garlic', baseUnit: 'g', typicalUnitGrams: 5 },
  'garlic clove': { canonicalName: 'garlic clove', baseUnit: 'g', typicalUnitGrams: 5 },
  carrot: { canonicalName: 'carrot', baseUnit: 'g', typicalUnitGrams: 70 },
  potato: { canonicalName: 'potato', baseUnit: 'g', typicalUnitGrams: 170 },
  'sweet potato': { canonicalName: 'sweet potato', baseUnit: 'g', typicalUnitGrams: 200 },
  tomato: { canonicalName: 'tomato', baseUnit: 'g', typicalUnitGrams: 90 },
  'cherry tomato': { canonicalName: 'cherry tomato', baseUnit: 'g', typicalUnitGrams: 15 },
  'bell pepper': { canonicalName: 'pepper', baseUnit: 'g', typicalUnitGrams: 120 },
  chilli: { canonicalName: 'chilli', baseUnit: 'g', typicalUnitGrams: 15 },
  cucumber: { canonicalName: 'cucumber', baseUnit: 'g', typicalUnitGrams: 300 },
  courgette: { canonicalName: 'courgette', baseUnit: 'g', typicalUnitGrams: 200 },
  aubergine: { canonicalName: 'aubergine', baseUnit: 'g', typicalUnitGrams: 250 },
  mushroom: { canonicalName: 'mushroom', baseUnit: 'g', typicalUnitGrams: 20 },
  broccoli: { canonicalName: 'broccoli', baseUnit: 'g', typicalUnitGrams: 300 },
  cauliflower: { canonicalName: 'cauliflower', baseUnit: 'g', typicalUnitGrams: 600 },
  cabbage: { canonicalName: 'cabbage', baseUnit: 'g', typicalUnitGrams: 900 },
  celery: { canonicalName: 'celery', baseUnit: 'g', typicalUnitGrams: 40 },
  leek: { canonicalName: 'leek', baseUnit: 'g', typicalUnitGrams: 150 },
  lettuce: { canonicalName: 'lettuce', baseUnit: 'g', typicalUnitGrams: 300 },
  spinach: { canonicalName: 'spinach', baseUnit: 'g' },
  kale: { canonicalName: 'kale', baseUnit: 'g' },
  peas: { canonicalName: 'peas', baseUnit: 'g' },
  sweetcorn: { canonicalName: 'sweetcorn', baseUnit: 'g' },
  'green bean': { canonicalName: 'green bean', baseUnit: 'g' },
  beetroot: { canonicalName: 'beetroot', baseUnit: 'g', typicalUnitGrams: 120 },
  'butternut squash': { canonicalName: 'butternut squash', baseUnit: 'g', typicalUnitGrams: 1000 },
  ginger: { canonicalName: 'ginger', baseUnit: 'g' },

  // ── Fruit ──────────────────────────────────────────────────────────────────
  apple: { canonicalName: 'apple', baseUnit: 'g', typicalUnitGrams: 180 },
  banana: { canonicalName: 'banana', baseUnit: 'g', typicalUnitGrams: 120 },
  lemon: { canonicalName: 'lemon', baseUnit: 'g', typicalUnitGrams: 100 },
  lime: { canonicalName: 'lime', baseUnit: 'g', typicalUnitGrams: 70 },
  orange: { canonicalName: 'orange', baseUnit: 'g', typicalUnitGrams: 200 },
  avocado: { canonicalName: 'avocado', baseUnit: 'g', typicalUnitGrams: 200 },
  strawberry: { canonicalName: 'strawberry', baseUnit: 'g', typicalUnitGrams: 12 },
  blueberry: { canonicalName: 'blueberry', baseUnit: 'g' },
  raspberry: { canonicalName: 'raspberry', baseUnit: 'g' },
  mango: { canonicalName: 'mango', baseUnit: 'g', typicalUnitGrams: 200 },
  pear: { canonicalName: 'pear', baseUnit: 'g', typicalUnitGrams: 180 },

  // ── Meat, fish & protein ─────────────────────────────────────────────────────
  'chicken breast': { canonicalName: 'chicken breast', baseUnit: 'g', typicalUnitGrams: 170 },
  'chicken thigh': { canonicalName: 'chicken thigh', baseUnit: 'g', typicalUnitGrams: 90 },
  chicken: { canonicalName: 'chicken', baseUnit: 'g' },
  'minced beef': { canonicalName: 'minced beef', baseUnit: 'g' },
  beef: { canonicalName: 'beef', baseUnit: 'g' },
  'minced pork': { canonicalName: 'minced pork', baseUnit: 'g' },
  pork: { canonicalName: 'pork', baseUnit: 'g' },
  sausage: { canonicalName: 'sausage', baseUnit: 'g', typicalUnitGrams: 60 },
  bacon: { canonicalName: 'bacon', baseUnit: 'g', typicalUnitGrams: 30 },
  lamb: { canonicalName: 'lamb', baseUnit: 'g' },
  salmon: { canonicalName: 'salmon', baseUnit: 'g', typicalUnitGrams: 130 },
  'salmon fillet': { canonicalName: 'salmon fillet', baseUnit: 'g', typicalUnitGrams: 130 },
  'cod fillet': { canonicalName: 'cod fillet', baseUnit: 'g', typicalUnitGrams: 150 },
  prawn: { canonicalName: 'prawn', baseUnit: 'g' },
  tuna: { canonicalName: 'tuna', baseUnit: 'g' },
  egg: { canonicalName: 'egg', baseUnit: 'g', typicalUnitGrams: 58 },
  tofu: { canonicalName: 'tofu', baseUnit: 'g' },

  // ── Dairy ────────────────────────────────────────────────────────────────────
  milk: { canonicalName: 'milk', baseUnit: 'ml' },
  butter: { canonicalName: 'butter', baseUnit: 'g' },
  cheese: { canonicalName: 'cheese', baseUnit: 'g' },
  cheddar: { canonicalName: 'cheddar', baseUnit: 'g' },
  parmesan: { canonicalName: 'parmesan', baseUnit: 'g' },
  mozzarella: { canonicalName: 'mozzarella', baseUnit: 'g', typicalUnitGrams: 125 },
  'cream cheese': { canonicalName: 'cream cheese', baseUnit: 'g' },
  cream: { canonicalName: 'cream', baseUnit: 'ml' },
  'double cream': { canonicalName: 'double cream', baseUnit: 'ml' },
  'soured cream': { canonicalName: 'soured cream', baseUnit: 'ml' },
  yoghurt: { canonicalName: 'yoghurt', baseUnit: 'g' },
  'greek yoghurt': { canonicalName: 'greek yoghurt', baseUnit: 'g' },
  'creme fraiche': { canonicalName: 'crème fraîche', baseUnit: 'g' },

  // ── Carbs, grains & baking ───────────────────────────────────────────────────
  flour: { canonicalName: 'plain flour', baseUnit: 'g' },
  'plain flour': { canonicalName: 'plain flour', baseUnit: 'g' },
  'self-raising flour': { canonicalName: 'self-raising flour', baseUnit: 'g' },
  'bread flour': { canonicalName: 'bread flour', baseUnit: 'g' },
  rice: { canonicalName: 'rice', baseUnit: 'g' },
  'basmati rice': { canonicalName: 'basmati rice', baseUnit: 'g' },
  pasta: { canonicalName: 'pasta', baseUnit: 'g' },
  spaghetti: { canonicalName: 'spaghetti', baseUnit: 'g' },
  noodle: { canonicalName: 'noodle', baseUnit: 'g' },
  bread: { canonicalName: 'bread', baseUnit: 'g' },
  breadcrumb: { canonicalName: 'breadcrumb', baseUnit: 'g' },
  oat: { canonicalName: 'oats', baseUnit: 'g' },
  couscous: { canonicalName: 'couscous', baseUnit: 'g' },
  quinoa: { canonicalName: 'quinoa', baseUnit: 'g' },
  tortilla: { canonicalName: 'tortilla', baseUnit: 'unit', typicalUnitGrams: 50 },
  'puff pastry': { canonicalName: 'puff pastry', baseUnit: 'g' },

  // ── Tins, jars & cupboard ────────────────────────────────────────────────────
  'chopped tomatoes': { canonicalName: 'chopped tomatoes', baseUnit: 'g', typicalUnitGrams: 400 },
  'tomato puree': { canonicalName: 'tomato purée', baseUnit: 'g' },
  'coconut milk': { canonicalName: 'coconut milk', baseUnit: 'ml', typicalUnitGrams: 400 },
  chickpeas: { canonicalName: 'chickpeas', baseUnit: 'g', typicalUnitGrams: 400 },
  'kidney beans': { canonicalName: 'kidney beans', baseUnit: 'g', typicalUnitGrams: 400 },
  'black beans': { canonicalName: 'black beans', baseUnit: 'g', typicalUnitGrams: 400 },
  lentil: { canonicalName: 'lentils', baseUnit: 'g' },
  'stock cube': { canonicalName: 'stock cube', baseUnit: 'unit' },
  'chicken stock': { canonicalName: 'chicken stock', baseUnit: 'ml' },
  'vegetable stock': { canonicalName: 'vegetable stock', baseUnit: 'ml' },
  'soy sauce': { canonicalName: 'soy sauce', baseUnit: 'ml' },
  honey: { canonicalName: 'honey', baseUnit: 'g' },
  'peanut butter': { canonicalName: 'peanut butter', baseUnit: 'g' },
  mustard: { canonicalName: 'mustard', baseUnit: 'g' },
  mayonnaise: { canonicalName: 'mayonnaise', baseUnit: 'g' },
  ketchup: { canonicalName: 'ketchup', baseUnit: 'ml' },

  // ── Baking & sweet ───────────────────────────────────────────────────────────
  sugar: { canonicalName: 'sugar', baseUnit: 'g' },
  'caster sugar': { canonicalName: 'caster sugar', baseUnit: 'g' },
  'brown sugar': { canonicalName: 'brown sugar', baseUnit: 'g' },
  'icing sugar': { canonicalName: 'icing sugar', baseUnit: 'g' },
  'baking powder': { canonicalName: 'baking powder', baseUnit: 'g', isStaple: true },
  'bicarbonate of soda': { canonicalName: 'bicarbonate of soda', baseUnit: 'g', isStaple: true },
  yeast: { canonicalName: 'yeast', baseUnit: 'g' },
  'vanilla extract': { canonicalName: 'vanilla extract', baseUnit: 'ml', isStaple: true },
  'cocoa powder': { canonicalName: 'cocoa powder', baseUnit: 'g' },
  'dark chocolate': { canonicalName: 'dark chocolate', baseUnit: 'g' },
  'chocolate chip': { canonicalName: 'chocolate chips', baseUnit: 'g' },

  // ── Oils & fats ──────────────────────────────────────────────────────────────
  'olive oil': { canonicalName: 'olive oil', baseUnit: 'ml', isStaple: true },
  'vegetable oil': { canonicalName: 'vegetable oil', baseUnit: 'ml', isStaple: true },
  'sunflower oil': { canonicalName: 'sunflower oil', baseUnit: 'ml', isStaple: true },
  'sesame oil': { canonicalName: 'sesame oil', baseUnit: 'ml', isStaple: true },

  // ── Herbs, spices & seasoning (mostly staples) ───────────────────────────────
  salt: { canonicalName: 'salt', baseUnit: 'g', isStaple: true },
  pepper: { canonicalName: 'black pepper', baseUnit: 'g', isStaple: true },
  'black pepper': { canonicalName: 'black pepper', baseUnit: 'g', isStaple: true },
  paprika: { canonicalName: 'paprika', baseUnit: 'g', isStaple: true },
  cumin: { canonicalName: 'cumin', baseUnit: 'g', isStaple: true },
  coriander: { canonicalName: 'coriander', baseUnit: 'g' },
  'ground coriander': { canonicalName: 'ground coriander', baseUnit: 'g', isStaple: true },
  cinnamon: { canonicalName: 'cinnamon', baseUnit: 'g', isStaple: true },
  turmeric: { canonicalName: 'turmeric', baseUnit: 'g', isStaple: true },
  'curry powder': { canonicalName: 'curry powder', baseUnit: 'g', isStaple: true },
  'chilli powder': { canonicalName: 'chilli powder', baseUnit: 'g', isStaple: true },
  oregano: { canonicalName: 'oregano', baseUnit: 'g', isStaple: true },
  basil: { canonicalName: 'basil', baseUnit: 'g' },
  thyme: { canonicalName: 'thyme', baseUnit: 'g', isStaple: true },
  rosemary: { canonicalName: 'rosemary', baseUnit: 'g', isStaple: true },
  parsley: { canonicalName: 'parsley', baseUnit: 'g' },
  mint: { canonicalName: 'mint', baseUnit: 'g' },
  'bay leaf': { canonicalName: 'bay leaf', baseUnit: 'unit', isStaple: true },
  nutmeg: { canonicalName: 'nutmeg', baseUnit: 'g', isStaple: true },

  // ── Liquids & always-on staples ──────────────────────────────────────────────
  water: { canonicalName: 'water', baseUnit: 'ml', isStaple: true },
  vinegar: { canonicalName: 'vinegar', baseUnit: 'ml', isStaple: true },
  'balsamic vinegar': { canonicalName: 'balsamic vinegar', baseUnit: 'ml', isStaple: true },
  'white wine': { canonicalName: 'white wine', baseUnit: 'ml' },
  'red wine': { canonicalName: 'red wine', baseUnit: 'ml' },
} as const satisfies Record<string, DictionaryEntry>

/**
 * Extra aliases → canonical key in {@link ENTRIES}. Plurals and descriptor
 * stripping are handled at lookup time, so this only needs genuine synonyms.
 */
const ALIASES: Record<string, keyof typeof ENTRIES> = {
  scallion: 'spring onion',
  'green onion': 'spring onion',
  aubergines: 'aubergine',
  eggplant: 'aubergine',
  zucchini: 'courgette',
  capsicum: 'bell pepper',
  'red pepper': 'bell pepper',
  'green pepper': 'bell pepper',
  'pepper (bell)': 'bell pepper',
  chili: 'chilli',
  chile: 'chilli',
  passata: 'chopped tomatoes',
  'tinned tomatoes': 'chopped tomatoes',
  'plum tomatoes': 'chopped tomatoes',
  mince: 'minced beef',
  'beef mince': 'minced beef',
  'pork mince': 'minced pork',
  'streaky bacon': 'bacon',
  'king prawn': 'prawn',
  'natural yoghurt': 'yoghurt',
  yogurt: 'yoghurt',
  'spring water': 'water',
  'all-purpose flour': 'plain flour',
  scallions: 'spring onion',
  'soya sauce': 'soy sauce',
  'tomato paste': 'tomato puree',
}

/** Full alias → entry map, built once from the canonical table plus synonyms. */
export const INGREDIENT_DICTIONARY: Record<string, DictionaryEntry> = (() => {
  const table: Record<string, DictionaryEntry> = {}
  for (const [key, entry] of Object.entries(ENTRIES)) table[key] = entry
  for (const [alias, target] of Object.entries(ALIASES)) table[alias] = ENTRIES[target]
  return table
})()

/** Leading descriptors stripped before a dictionary lookup ("large red onion"). */
const DESCRIPTORS = new Set([
  'large',
  'medium',
  'small',
  'baby',
  'fresh',
  'frozen',
  'dried',
  'ripe',
  'free-range',
  'free',
  'range',
  'organic',
  'raw',
  'cooked',
  'boneless',
  'skinless',
  'lean',
  'whole',
  'finely',
  'roughly',
  'extra',
  'virgin',
  'plain',
  'natural',
  'good',
  'quality',
])

/**
 * Look an ingredient name up in the dictionary, tolerant of plurals and leading
 * descriptors. Tries the full name first, then progressively strips descriptor
 * words from the front, returning the first hit or `null`.
 */
export function lookupIngredient(name: string): DictionaryEntry | null {
  const cleaned = name.toLowerCase().trim().replace(/[.,]/g, '').replace(/\s+/g, ' ')
  if (!cleaned) return null

  const direct = matchWithPlural(cleaned)
  if (direct) return direct

  // Drop leading descriptor words one at a time ("large free-range egg" → "egg").
  const words = cleaned.split(' ')
  let start = 0
  while (start < words.length - 1 && DESCRIPTORS.has(words[start])) {
    start += 1
    const candidate = words.slice(start).join(' ')
    const hit = matchWithPlural(candidate)
    if (hit) return hit
  }
  return null
}

/** Match a name directly or with a single trailing plural "s" removed. */
function matchWithPlural(name: string): DictionaryEntry | null {
  if (INGREDIENT_DICTIONARY[name]) return INGREDIENT_DICTIONARY[name]
  if (name.endsWith('es') && INGREDIENT_DICTIONARY[name.slice(0, -2)])
    return INGREDIENT_DICTIONARY[name.slice(0, -2)]
  if (name.endsWith('s') && INGREDIENT_DICTIONARY[name.slice(0, -1)])
    return INGREDIENT_DICTIONARY[name.slice(0, -1)]
  return null
}
