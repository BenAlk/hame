/**
 * Pure parsers for South Lanarkshire Council's bin pages. Tested against saved
 * fixtures of the real site (`src/__fixtures__`), so a markup change is caught
 * by a failing test rather than silently-wrong dates.
 *
 * The record page exposes a "This week's collection" block (a dated window + the
 * bins out that week) and a table of every bin's weekday + frequency. Concrete
 * future dates are not published — `project.ts` derives them from one reading.
 */
import type { Address, BinSchedule, CollectionObservation, IsoWeekday } from '../../types.js'
import { parseFrequencyDays, parseLongDate, parseWeekday } from '../../dates.js'

const ORIGIN = 'https://www.southlanarkshire.gov.uk'

/**
 * A stable colour key for matching a bin across the page's two spellings
 * (the table's "Burgundy - Food and garden" vs the snippet's "Burgundy bin …").
 * Takes the text before the first "-" or "(", drops a trailing "bin", lowercases,
 * and keeps only the **last** word.
 *
 * That last step matters: the two spellings disagree about more than the trailing
 * description. The table calls one bin "Light Grey - Glass, cans and plastics"
 * where the snippet calls it "Grey bin - glass, cans and plastics", so anything
 * that keeps the shade qualifier gives "light grey" on one side and "grey" on the
 * other and the two never meet. Reducing to the colour word leaves a single-word
 * colour ("burgundy", "blue") and a slashed pair ("black/green") untouched.
 *
 * A mismatch here is not cosmetic, which is why this is worth the narrowing: a
 * bin whose spellings don't reduce to one key is never seen as out in the observed
 * week, and a 4-weekly bin has no other way to pin its phase from a single reading
 * (`project.ts`), so it silently projects no dates at all.
 */
export function normaliseKey(name: string): string {
  const colour = name
    .toLowerCase()
    .split(/[-(]/)[0]
    .replace(/\bbin\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = colour.split(' ')
  return words[words.length - 1]
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Bin names listed in the "This week's collection" snippet. */
function parseOutThisWeek(html: string): Set<string> {
  const block = /This week's collection[\s\S]*?<ul>([\s\S]*?)<\/ul>/i.exec(html)
  const keys = new Set<string>()
  if (!block) return keys
  for (const m of block[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)) {
    keys.add(normaliseKey(decodeEntities(m[1])))
  }
  return keys
}

/**
 * Parse a street record page into a schedule observation. Throws if the page
 * lacks the expected "this week" window (e.g. an error or unexpected page).
 */
export function parseRecordPage(html: string): CollectionObservation {
  const window = /This week's collection<\/h3>\s*<p>([\s\S]*?)<\/p>/i.exec(html)
  const [startText, endText] = (window?.[1] ?? '').split(/\bto\b/)
  const weekStart = startText ? parseLongDate(startText) : null
  const weekEnd = endText ? parseLongDate(endText) : null
  if (!weekStart || !weekEnd) {
    throw new Error('Could not read the "this week\'s collection" window from the record page')
  }

  const outThisWeek = parseOutThisWeek(html)

  const table = /<table[^>]*summary\s*=\s*"Bin collection[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(
    html,
  )
  if (!table) throw new Error('Could not find the bin collection table on the record page')

  let area: string | null = null
  const bins: BinSchedule[] = []
  for (const row of table[1].matchAll(
    /<th>([\s\S]*?)<\/th>\s*<td class="record">([\s\S]*?)<\/td>/gi,
  )) {
    const label = decodeEntities(row[1])
    const value = decodeEntities(row[2])
    if (/^area$/i.test(label)) {
      area = value
      continue
    }
    const detail = /^([A-Za-z]+)\s*\((.+)\)\s*$/.exec(value)
    if (!detail) continue // not a "Weekday (Frequency)" row
    const weekday = parseWeekday(detail[1])
    const frequencyDays = parseFrequencyDays(detail[2])
    if (weekday === null || frequencyDays === null) continue
    const key = normaliseKey(label)
    bins.push({
      name: label,
      key,
      weekday: weekday as IsoWeekday,
      frequencyDays,
      outThisWeek: outThisWeek.has(key),
    })
  }

  return { area, weekStart, weekEnd, bins }
}

/** Parse a directory search results page into address candidates. */
export function parseAddressSearch(html: string): Address[] {
  const list = /<ul class="list">([\s\S]*?)<\/ul>/i.exec(html)
  const scope = list?.[1] ?? html
  const out: Address[] = []
  const seen = new Set<string>()
  for (const m of scope.matchAll(
    /<a href="(\/directory_record\/(\d+)\/[^"]*)"[^>]*>([^<]+)<\/a>/gi,
  )) {
    const id = m[2]
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, label: decodeEntities(m[3]), url: `${ORIGIN}${m[1]}` })
  }
  return out
}
