# uk-bin-scraper

Household bin collection schedules from UK council websites, behind one
per-council interface. Built for [Hame](../../README.md)'s `SCRAPER` bin source,
but dependency-free and usable on its own.

## Why it's not just "fetch and read dates"

Most councils never publish concrete future dates. A street's page typically
shows only **this week's collection** plus each bin's **weekday + frequency**
(weekly / fortnightly / 4-weekly). So the scraper works in two steps:

1. **Observe** — read one snapshot of the page into a `CollectionObservation`.
2. **Project** — derive concrete dates from that snapshot.

From a single observation:

- a bin **out this week** is anchored exactly, then projected forward;
- a **weekly** or **fortnightly** bin not out this week has only one possible
  phase, so it's still exact;
- a **4-weekly** bin not out this week is ambiguous (it could be +1/+2/+3 weeks).
  It's placed only when a `priorAnchor` — a known past collection date from an
  earlier reading — is supplied. Re-read on a schedule and feed the latest date
  back, and it pins within one cycle, then self-corrects (bank holidays included).

## Usage

```ts
import { getCouncil, projectBinDates } from 'uk-bin-scraper'

const council = getCouncil('south-lanarkshire')!
const [address] = await council.findAddresses('Angle Street') // setup-time lookup
const observation = await council.fetchObservation(address.id) // runtime read

const to = new Date(Date.now() + 56 * 86_400_000)
for (const bin of observation.bins) {
  const dates = projectBinDates(bin, observation, { to /*, priorAnchor */ })
  console.log(bin.name, dates)
}
```

## Adding a council

Implement `CouncilScraper` (`findAddresses`, `fetchObservation`) with **pure**
parsers tested against a saved HTML fixture of the live site (see
`src/councils/south-lanarkshire`), then register it in `councils/registry.ts`.
Keeping parsers pure and fixture-tested means a council changing its markup is
caught by a failing test rather than silently-wrong dates.

## Supported councils

- **South Lanarkshire** (`south-lanarkshire`)
