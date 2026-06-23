/**
 * South Lanarkshire Council adapter.
 *
 * The council splits its area into directory zones (Clydesdale incl. Stonehouse,
 * Hamilton, East Kilbride, Cambuslang & Rutherglen). Address search hits each
 * zone's directory; a resolved address is a numeric directory-record id, and the
 * record page (`/directory_record/{id}/…`, the slug is ignored) carries the
 * schedule. Both fetches delegate to the pure parsers in `parse.ts`.
 */
import type { Address, CollectionObservation, CouncilScraper } from '../../types.js'
import { fetchText } from '../../http.js'
import { parseAddressSearch, parseRecordPage } from './parse.js'

const ORIGIN = 'https://www.southlanarkshire.gov.uk'

/** The bin-collection directory per zone (directoryID → label). */
const ZONE_DIRECTORIES: ReadonlyArray<{ id: number; label: string }> = [
  { id: 160, label: 'Clydesdale' },
  { id: 161, label: 'Cambuslang & Rutherglen' },
  { id: 162, label: 'East Kilbride' },
  { id: 163, label: 'Hamilton' },
]

function searchUrl(directoryId: number, query: string): string {
  return `${ORIGIN}/site/scripts/directory_search.php?directoryID=${directoryId}&keywords=${encodeURIComponent(query)}`
}

function recordUrl(addressId: string): string {
  // The slug after the id is ignored by the site; a placeholder keeps it on the
  // public record path while config only needs to store the stable numeric id.
  return `${ORIGIN}/directory_record/${encodeURIComponent(addressId)}/bins`
}

export const southLanarkshire: CouncilScraper = {
  id: 'south-lanarkshire',
  name: 'South Lanarkshire',
  // The council's bin finder indexes streets, not postcodes (verified live).
  searchHint: 'Search by street name — this council’s bin finder doesn’t take postcodes.',

  async findAddresses(query: string): Promise<Address[]> {
    const pages = await Promise.all(
      ZONE_DIRECTORIES.map(async (zone) => {
        try {
          return parseAddressSearch(await fetchText(searchUrl(zone.id, query)))
        } catch {
          return [] as Address[] // one zone failing shouldn't sink the search
        }
      }),
    )
    const merged: Address[] = []
    const seen = new Set<string>()
    for (const addr of pages.flat()) {
      if (seen.has(addr.id)) continue
      seen.add(addr.id)
      merged.push(addr)
    }
    return merged
  },

  async fetchObservation(addressId: string): Promise<CollectionObservation> {
    return parseRecordPage(await fetchText(recordUrl(addressId)))
  },
}
