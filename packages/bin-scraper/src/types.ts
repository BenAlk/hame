/**
 * Shared types for uk-bin-scraper.
 *
 * Councils rarely publish concrete future collection dates — most expose only
 * "this week's collection" plus each bin's weekday and frequency. The scraping
 * model is therefore: read one **observation** of the schedule, then **project**
 * concrete dates forward (see `project.ts`). Dates are date-only at UTC midnight,
 * the unambiguous representation for an all-day collection.
 */

/** A weekday number, 1 = Monday … 7 = Sunday (ISO-8601). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** One bin's schedule as read from a council page. */
export interface BinSchedule {
  /** The bin's name exactly as the council shows it, e.g. "Burgundy - Food and garden". */
  name: string
  /** A normalised key for matching ("burgundy", "black/green", "blue", "grey"). */
  key: string
  /** The collection weekday. */
  weekday: IsoWeekday
  /** Days between collections — 7 (weekly), 14 (fortnightly) or 28 (4-weekly). */
  frequencyDays: number
  /** Whether this bin is among those collected in the observed week. */
  outThisWeek: boolean
}

/** A single reading of a street's collection schedule. */
export interface CollectionObservation {
  /** The collection area/round, e.g. "Hamilton" (null if the page omits it). */
  area: string | null
  /** Monday of the observed "this week" window (UTC-midnight date-only). */
  weekStart: Date
  /** Friday of the observed window (UTC-midnight date-only). */
  weekEnd: Date
  /** Every bin listed for the street. */
  bins: BinSchedule[]
}

/** A street/address result from a council's address lookup. */
export interface Address {
  /** The council's stable identifier for the address (a directory-record id). */
  id: string
  /** Human-readable label, e.g. "Angle Street, Stonehouse". */
  label: string
  /** The absolute record URL. */
  url: string
}

/**
 * One council's adapter. `findAddresses` is a setup-time convenience (postcode/
 * street → addresses); runtime only needs `fetchObservation(addressId)`.
 */
export interface CouncilScraper {
  /** Stable slug used in config, e.g. "south-lanarkshire". */
  readonly id: string
  /** Display name, e.g. "South Lanarkshire". */
  readonly name: string
  /**
   * What the address search expects, for the UI — councils differ (some take a
   * postcode, some only a street name). Shown beside the search box.
   */
  readonly searchHint: string
  /** Find candidate addresses for a free-text query (street name / partial). */
  findAddresses(query: string): Promise<Address[]>
  /** Read the current schedule observation for a resolved address id. */
  fetchObservation(addressId: string): Promise<CollectionObservation>
}
