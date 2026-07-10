/**
 * Gitea / Forgejo milestones provider (spec §10 Phase 10.1 — the reference
 * CALENDAR provider). A self-hosted git server exposes a repo's milestones over a
 * plain `GET /api/v1/repos/{owner}/{repo}/milestones` with `Authorization: token`
 * header auth; each milestone with a due date becomes a dated calendar event.
 *
 * It is admin-configured and points at a LAN service, so — like the Home
 * Assistant / Immich clients — it uses plain `fetch`, *not* `safeFetch`: the SSRF
 * guard's private-IP block is for arbitrary user URLs, and would wrongly refuse a
 * homelab git server (spec §8.6).
 *
 * Built against Gitea's `/api/v1`; Forgejo ≥ 12 has diverged its API, so treat
 * Forgejo support as verified-not-assumed (spec §10 Phase 10.1).
 *
 * {@link mapMilestonesToEvents} is the pure (milestones → events) core, unit
 * tested without the network; {@link giteaProvider} is the thin fetch wrapper.
 */
import { z } from 'zod'
import type {
  CalendarIntegrationProvider,
  FetchedIntegrationEvent,
  IntegrationContext,
  IntegrationFetchHorizon,
} from './index.js'

/** The subset of a Gitea milestone we read; extra fields are ignored. */
export interface GiteaMilestone {
  id: number
  title: string
  due_on: string | null
}

const GiteaMilestoneSchema = z.object({
  id: z.number(),
  title: z.string(),
  // Gitea sends `0001-01-01T00:00:00Z` (not null) for "no due date"; treat any
  // pre-1970 date as unset too, so both shapes are handled.
  due_on: z.string().nullable().optional(),
})

const GiteaConfigSchema = z.object({
  url: z.string().url(),
  owner: z.string().min(1),
  repo: z.string().min(1),
})

/** UTC midnight of a date's calendar day — how all-day `@db.Date`-style rows store. */
function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Parse a Gitea `due_on`, returning null for missing / sentinel / pre-1970 dates. */
function parseDueDate(due: string | null | undefined): Date | null {
  if (!due) return null
  const d = new Date(due)
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1970) return null
  return d
}

/**
 * Turn a repo's milestones into cache-ready calendar events. Keeps only those
 * with a real due date that falls within the horizon; each becomes an all-day
 * event on its due day, titled "repo: milestone". Pure — the service caches
 * whatever this returns.
 */
export function mapMilestonesToEvents(
  milestones: GiteaMilestone[],
  repo: string,
  horizon: IntegrationFetchHorizon,
): FetchedIntegrationEvent[] {
  const start = toUtcDateOnly(horizon.start).getTime()
  const end = toUtcDateOnly(horizon.end).getTime()
  const out: FetchedIntegrationEvent[] = []

  for (const m of milestones) {
    const due = parseDueDate(m.due_on)
    if (!due) continue
    const date = toUtcDateOnly(due)
    const t = date.getTime()
    if (t < start || t > end) continue
    out.push({
      externalId: `milestone:${m.id}`,
      title: `${repo}: ${m.title}`,
      startTime: date,
      endTime: null,
      allDay: true,
    })
  }

  out.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  return out
}

function readConfig(config: Record<string, unknown>): z.infer<typeof GiteaConfigSchema> {
  const parsed = GiteaConfigSchema.safeParse(config)
  if (!parsed.success) throw new Error('Gitea needs a server URL, owner and repository')
  return parsed.data
}

/** Base URL of the repo API, trailing slash trimmed. */
function repoApiBase(url: string, owner: string, repo: string): string {
  return `${url.replace(/\/+$/, '')}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

function authHeaders(secret: string | null): Record<string, string> {
  return secret ? { Authorization: `token ${secret}` } : {}
}

async function giteaFetch(target: string, secret: string | null): Promise<Response> {
  return fetch(target, {
    headers: { Accept: 'application/json', ...authHeaders(secret) },
    // A homelab git server should answer fast; don't hang the poller on a dead host.
    signal: AbortSignal.timeout(15_000),
  })
}

export const giteaProvider: CalendarIntegrationProvider = {
  id: 'gitea',
  name: 'Gitea / Forgejo milestones',
  kind: 'CALENDAR',
  description:
    "A self-hosted Gitea (or Forgejo) repository's milestone due-dates on your calendar.",
  configFields: [
    {
      key: 'url',
      label: 'Server URL',
      type: 'url',
      placeholder: 'https://git.example.com',
      required: true,
    },
    {
      key: 'owner',
      label: 'Owner / organisation',
      type: 'text',
      placeholder: 'ben',
      required: true,
    },
    { key: 'repo', label: 'Repository', type: 'text', placeholder: 'hame', required: true },
  ],
  secretFields: [
    {
      key: 'token',
      label: 'Access token',
      type: 'password',
      help: 'A Gitea access token (Settings → Applications). Read-only is enough.',
      required: true,
    },
  ],

  async test(ctx: IntegrationContext): Promise<void> {
    const { url, owner, repo } = readConfig(ctx.config)
    // Fetching the repo validates URL, token and owner/repo in one call.
    const res = await giteaFetch(repoApiBase(url, owner, repo), ctx.secret)
    if (res.status === 401 || res.status === 403) throw new Error('The access token was rejected')
    if (res.status === 404) throw new Error('That owner/repository was not found')
    if (!res.ok) throw new Error(`Gitea responded ${res.status}`)
  },

  async fetchEvents(
    ctx: IntegrationContext,
    horizon: IntegrationFetchHorizon,
  ): Promise<FetchedIntegrationEvent[]> {
    const { url, owner, repo } = readConfig(ctx.config)
    const res = await giteaFetch(
      `${repoApiBase(url, owner, repo)}/milestones?state=all&limit=50`,
      ctx.secret,
    )
    if (!res.ok) throw new Error(`Gitea responded ${res.status}`)
    const body: unknown = await res.json()
    const milestones = z.array(GiteaMilestoneSchema).parse(body) as GiteaMilestone[]
    return mapMilestonesToEvents(milestones, repo, horizon)
  },
}
