/** Registry of supported councils, keyed by their stable slug. */
import type { CouncilScraper } from '../types.js'
import { southLanarkshire } from './south-lanarkshire/index.js'

const councils = new Map<string, CouncilScraper>([[southLanarkshire.id, southLanarkshire]])

/** Every supported council (for a picker UI). */
export function listCouncils(): CouncilScraper[] {
  return [...councils.values()]
}

/** The adapter for a council slug, or null if unsupported. */
export function getCouncil(id: string): CouncilScraper | null {
  return councils.get(id) ?? null
}
