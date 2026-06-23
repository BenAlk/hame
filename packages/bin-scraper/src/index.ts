/**
 * uk-bin-scraper — household bin collection schedules from UK council websites,
 * behind one per-council interface.
 *
 * Councils seldom publish concrete future dates, so the flow is two steps:
 *   1. `getCouncil(id).fetchObservation(addressId)` reads one schedule observation;
 *   2. `projectBinDates(bin, observation, { to, priorAnchor })` turns it into
 *      concrete collection dates (see `project.ts` for the anchoring rules).
 *
 * `findAddresses` resolves a street/postcode to an address id at setup time.
 */
export type {
  Address,
  BinSchedule,
  CollectionObservation,
  CouncilScraper,
  IsoWeekday,
} from './types.js'
export { getCouncil, listCouncils } from './councils/registry.js'
export { projectBinDates, type ProjectOptions } from './project.js'
