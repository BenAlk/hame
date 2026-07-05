# Hame

> A self-hosted household management application for couples and families.
> **"Hame"** is Scots for "home."

Shopping lists, recipes, meal planning, pantry tracking, chores, pet care, bin
reminders, a shared calendar, and smart-home controls via Home Assistant — in
one self-hosted app, designed for a wall-mounted tablet dashboard.

See [`hame-specification.md`](./hame-specification.md) for the full design document.

## Tech stack

- **Monorepo** — pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`)
- **Frontend** — Vite + React + TypeScript + Tailwind + shadcn/ui
- **Backend** — Express + Prisma + PostgreSQL
- **Shared** — Zod schemas validated on both client and server

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10 (`npm install -g pnpm`)
- Docker + Docker Compose (for PostgreSQL)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env        # then edit secrets

# 3. Start PostgreSQL
pnpm db:up

# 4. Apply database migrations + seed demo data
pnpm db:migrate
pnpm db:seed

# 5. Run the full stack (shared + api + web)
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:4000

> **First-run credentials.** `pnpm db:seed` creates demo users with the password
> `changeme123` (admin: `alex`, member: `sam`). These are for local development
> only — if you deploy Hame, either skip the seed and use the first-run setup
> wizard to create your admin, or change every seeded password immediately.

## Workspace scripts

| Command           | Description                                 |
| ----------------- | ------------------------------------------- |
| `pnpm dev`        | Run shared (watch) + api + web concurrently |
| `pnpm build`      | Build all packages                          |
| `pnpm typecheck`  | Type-check every package                    |
| `pnpm lint`       | Lint the whole repo                         |
| `pnpm format`     | Format with Prettier                        |
| `pnpm test`       | Run tests across packages                   |
| `pnpm db:up`      | Start the PostgreSQL container              |
| `pnpm db:migrate` | Run Prisma migrations                       |
| `pnpm db:seed`    | Seed demo data                              |
| `pnpm db:studio`  | Open Prisma Studio                          |

## Optional: LLM ingredient normalisation

Recipe imports clean up free-text ingredients into linkable items. By default this uses a built-in
parser (and an optional bundled dictionary) — no setup required. For best results you can point Hame
at a self-hosted [Ollama](https://ollama.com) server: in the app, go to **Settings → Ingredient
normalisation**, choose **Language model**, enter the server URL (its installed models load into a
dropdown), and save. If Ollama is unreachable, imports fall back to the dictionary/parser
automatically — it's never required.

### Suggested model

Normalisation is structured JSON extraction (messy text → clean fields), so a small
instruction-tuned model is plenty — raw size matters far less than reliable JSON output. On a
typical homelab GPU (~8 GB VRAM):

| Model                          | Pull                     | Notes                                                                                                  |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| **`qwen2.5:7b`** (recommended) | `ollama pull qwen2.5:7b` | Q4_K_M by default (~4.7 GB); best structured-output quality for its size, comfortable headroom on 8 GB |
| `qwen2.5:3b`                   | `ollama pull qwen2.5:3b` | Faster, lighter; small quality drop on the long tail                                                   |
| `llama3.1`                     | `ollama pull llama3.1`   | The built-in default; fine if you already have it                                                      |

Whatever you pull appears in the model dropdown — no config file to edit. Avoid "thinking"/reasoning
variants here: at `temperature: 0` they add latency without improving a constrained extraction.

Opening the recipe-import dialog preloads the selected model in the background, so the first import
of a session isn't slowed by Ollama's cold-start.

## Optional: phone calendar sync (CalDAV)

Hame can serve its calendar over **CalDAV** so household members read **and write** it from their
phone's native calendar app — two-way, self-hosted, no third-party cloud. It's **off by default**.

1. An admin enables it under **Settings → Phone calendar (CalDAV)**.
2. Each member opens **Profile → Phone calendar (CalDAV)**, generates an **app password** (shown
   once), and notes the **Server URL** displayed there.
3. In a CalDAV client (e.g. [DAVx5](https://www.davx5.com/) on Android) add an account with
   **"Login with URL and user name"**: the Server URL, your Hame username, and the app password.
   The **Household** calendar appears — enable it to sync.

The Server URL adapts to how you reach Hame: behind a domain it's that domain; on the LAN it's the
server's detected IP. To pin a specific public address, set `CALDAV_PUBLIC_URL` (see `.env.example`).
Your reverse proxy must route `/caldav` and `/.well-known/caldav` to the API — the bundled
`docker/nginx.conf` already does. App passwords are argon2-hashed; your account password is never
shared with the device.

## Optional: automatic bin collection schedules

By default you type each bin's schedule in (e.g. "Tuesday, fortnightly"). Hame can also pull the
dates from your council so they stay correct on their own — bank-holiday shifts included — chosen
per bin under **Bins → New bin → Collection dates come from**:

- **A council iCal feed** — paste the feed URL; an optional match term picks one bin out of a feed
  that lists several.
- **My council's website** — where a scraper module exists for your council, search your address and
  Hame reads the schedule straight from the council site. Use **"add all my bins"** to create every
  bin at your address in one go, each auto-coloured from its name. Supported councils (and how to add
  one) live in [`packages/bin-scraper`](./packages/bin-scraper/README.md).

External bins cache their dates and refresh on a schedule (`BIN_SYNC_CRON`, nightly by default), with
a **Sync now** button per bin. A failed fetch keeps the last good dates and just logs a warning. Some
councils only publish "this week" plus a frequency, so a 4-weekly bin can take a sync or two before
every future date is known — see the package README for why.

## Optional: photo screensaver (Immich) + idle mode

Left idle, the wall tablet turns into a digital photo frame — cycling photos from your self-hosted
[Immich](https://immich.app) library and a large clock, until you touch it. It runs only on the home
dashboard of the device showing the shared **Household** view (the wall tablet), so phones on their own
"My dashboard" never screensave mid-use. It's controlled under **Settings → Idle mode** (kill-switch,
how long before it activates, per-photo / per-clock durations, shuffle, and whether to show weather on
the clock screen). With no photo library configured it falls back to a clock-only screensaver.

To show photos, an admin connects Immich under **Settings → Immich**: the server URL and an **API
key** (Immich → Account Settings → API Keys), then optionally pick which albums to include (none
selected = all photos). The API key is **AES-256-GCM encrypted at rest** and never leaves the server —
the screensaver pulls each photo **through Hame's backend proxy**, so your Immich credentials are never
exposed to the browser and it works even when Hame is reached remotely.
