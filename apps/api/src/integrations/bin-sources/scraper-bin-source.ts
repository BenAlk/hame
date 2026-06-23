/**
 * uk-bin-scraper bin-source provider (spec §8.9, §12, §10 Phase 5.6 next step 2).
 *
 * Councils publish only "this week" + each bin's weekday/frequency, so the
 * library reads one observation and projects concrete dates forward. A 4-weekly
 * bin not collected in the observed week can't be placed from a single reading,
 * so we feed the last cached collection date back as a `priorAnchor` (passed by
 * the bin service): the bin pins within one cycle and then self-corrects.
 */
import type { BinSourceConfig } from '@hame/shared'
import { getCouncil, projectBinDates } from 'uk-bin-scraper'
import type {
  BinScheduleProvider,
  BinSyncContext,
  BinSyncHorizon,
  FetchedBinOccurrence,
} from './index.js'

/** Pick the one bin on a multi-bin council page this BinCollection represents. */
function matchBin<T extends { name: string; key: string }>(bins: T[], matchKey?: string): T {
  if (!matchKey) {
    if (bins.length === 1) return bins[0]
    throw new Error('Several bins are listed for this address — set a bin name to match')
  }
  const mk = matchKey.toLowerCase().trim()
  const hits = bins.filter((b) => b.key.includes(mk) || b.name.toLowerCase().includes(mk))
  if (hits.length === 0) throw new Error(`No bin matching "${matchKey}" on the council page`)
  return hits[0]
}

export const scraperBinProvider: BinScheduleProvider = {
  type: 'SCRAPER',
  async fetchOccurrences(
    config: BinSourceConfig,
    horizon: BinSyncHorizon,
    context?: BinSyncContext,
  ): Promise<FetchedBinOccurrence[]> {
    if (!config.councilId || !config.addressId) {
      throw new Error('A council and address are required')
    }
    const council = getCouncil(config.councilId)
    if (!council) throw new Error(`Council "${config.councilId}" is not supported`)

    const observation = await council.fetchObservation(config.addressId)
    const bin = matchBin(observation.bins, config.matchKey)
    const dates = projectBinDates(bin, observation, {
      from: horizon.start,
      to: horizon.end,
      priorAnchor: context?.priorAnchor,
    })
    return dates.map((date) => ({ date }))
  },
}
