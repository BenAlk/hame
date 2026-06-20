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
