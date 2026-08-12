import { describe, it, expect, vi, beforeEach } from 'vitest'
import { STORAGE_TYPES, STORAGE_TYPE_LABELS, defaultLocationForStorage } from '@hame/shared'
import {
  NO_STORAGE_TYPE,
  buildStoragePrompt,
  parseSuggestedStorageType,
} from '../integrations/ollama/index.js'

/** Storage type as a single-valued field (spec §10 Phase 25). */

const loc = (id: string, storageType: Parameters<typeof defaultLocationForStorage>[1] = null) => ({
  id,
  storageType: storageType ?? null,
})

describe('defaultLocationForStorage', () => {
  const locations = [
    loc('fridge', 'CHILLED'),
    loc('cupboard', 'AMBIENT'),
    loc('freezer', 'FROZEN'),
    loc('beverage-cupboard', 'AMBIENT'),
  ]

  it('sends a chilled item to a chilled place', () => {
    expect(defaultLocationForStorage(locations, 'CHILLED')?.id).toBe('fridge')
  })

  /** The fault that motivated the phase: cheddar was offered the garage freezer. */
  it('does not simply return the first location', () => {
    expect(defaultLocationForStorage(locations, 'FROZEN')?.id).toBe('freezer')
  })

  /** Deterministic, so two ambient cupboards don't alternate between page loads. */
  it('breaks a tie by the order given', () => {
    expect(defaultLocationForStorage(locations, 'AMBIENT')?.id).toBe('cupboard')
  })

  /** Both fall back to the caller's own behaviour rather than to nothing. */
  it('declines when the item has no storage type', () => {
    expect(defaultLocationForStorage(locations, null)).toBeNull()
    expect(defaultLocationForStorage(locations, undefined)).toBeNull()
  })

  it('declines when no location declares that type', () => {
    expect(defaultLocationForStorage([loc('shelf', 'AMBIENT')], 'FROZEN')).toBeNull()
  })

  it('declines when a household has no locations at all', () => {
    expect(defaultLocationForStorage([], 'CHILLED')).toBeNull()
  })

  /** A location that holds anything is not a destination for anything in particular. */
  it('ignores locations declaring no type', () => {
    expect(defaultLocationForStorage([loc('somewhere')], 'CHILLED')).toBeNull()
  })
})

describe('the storage prompt', () => {
  /**
   * "Fresh" and "chilled" are not self-evident, and a model treating them as
   * interchangeable is exactly how milk came back ambient.
   */
  it('glosses each choice rather than just naming it', () => {
    const prompt = buildStoragePrompt('Cheddar')
    for (const type of STORAGE_TYPES) expect(prompt).toContain(type)
    expect(prompt).toMatch(/fridge/)
    expect(prompt).toMatch(/freezer/)
    expect(prompt).toMatch(/room temperature/)
  })

  it('asks for exactly one, and offers a way out', () => {
    const prompt = buildStoragePrompt('Cheddar')
    expect(prompt).toMatch(/exactly one/)
    expect(prompt).toContain(NO_STORAGE_TYPE)
  })

  it('names the item it is asking about', () => {
    expect(buildStoragePrompt('Semi skimmed milk')).toContain('"Semi skimmed milk"')
  })
})

describe('parseSuggestedStorageType', () => {
  it('reads a valid choice', () => {
    expect(parseSuggestedStorageType('{"storageType":"CHILLED"}')).toBe('CHILLED')
  })

  /** A model that lower-cases the enum still gets resolved. */
  it('matches ignoring case', () => {
    expect(parseSuggestedStorageType('{"storageType":"chilled"}')).toBe('CHILLED')
  })

  /** Declining is a first-class answer, not something inferred from a bad one. */
  it('reads the sentinel as a decline', () => {
    expect(parseSuggestedStorageType(`{"storageType":"${NO_STORAGE_TYPE}"}`)).toBeNull()
  })

  /** Belt and braces over the grammar, as its siblings have. */
  it('drops a value outside the closed set', () => {
    expect(parseSuggestedStorageType('{"storageType":"CUPBOARD"}')).toBeNull()
  })

  it('survives unusable replies', () => {
    expect(parseSuggestedStorageType('not json')).toBeNull()
    expect(parseSuggestedStorageType('{}')).toBeNull()
    expect(parseSuggestedStorageType('{"storageType":2}')).toBeNull()
    expect(parseSuggestedStorageType('null')).toBeNull()
  })
})

describe('storage type labels', () => {
  it('names and explains every type', () => {
    for (const type of STORAGE_TYPES) {
      expect(STORAGE_TYPE_LABELS[type].label).not.toBe('')
      expect(STORAGE_TYPE_LABELS[type].description).not.toBe('')
    }
  })
})

// ── The service ────────────────────────────────────────────────────────────—

const getLlm = vi.fn()
vi.mock('../lib/prisma.js', () => ({ prisma: { tag: {}, item: {} } }))
vi.mock('../services/normaliser.service.js', () => ({ getLlm }))

const { suggestStorageType } = await import('../services/item.service.js')

describe('suggestStorageType', () => {
  beforeEach(() => getLlm.mockReset())

  it('returns what the model chose', async () => {
    getLlm.mockResolvedValue({ suggestStorageType: vi.fn().mockResolvedValue('CHILLED') })
    expect(await suggestStorageType('cheddar')).toEqual({ storageType: 'CHILLED', source: 'LLM' })
  })

  it('trims the name before asking', async () => {
    const ask = vi.fn().mockResolvedValue('FROZEN')
    getLlm.mockResolvedValue({ suggestStorageType: ask })
    await suggestStorageType('  ice cream  ')
    expect(ask).toHaveBeenCalledWith('ice cream')
  })

  /**
   * Unlike tags and sections there is no empty-pool case to separate: the choices
   * are a project constant, so UNAVAILABLE can only mean "no model".
   */
  it('reports UNAVAILABLE with no model configured', async () => {
    getLlm.mockResolvedValue(null)
    expect(await suggestStorageType('cheddar')).toEqual({
      storageType: null,
      source: 'UNAVAILABLE',
    })
  })

  /** A model that genuinely cannot say is a real answer, distinct from a failure. */
  it('reports LLM with no type when the model declines', async () => {
    getLlm.mockResolvedValue({ suggestStorageType: vi.fn().mockResolvedValue(null) })
    expect(await suggestStorageType('widget')).toEqual({ storageType: null, source: 'LLM' })
  })

  it('reports FAILED when the call never completes', async () => {
    getLlm.mockResolvedValue({
      suggestStorageType: vi.fn().mockRejectedValue(new Error('The operation was aborted')),
    })
    expect(await suggestStorageType('cheddar')).toEqual({ storageType: null, source: 'FAILED' })
  })
})
