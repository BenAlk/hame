import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

// Load the repo-root .env (apps/api/src/lib -> repo root is four levels up).
const here = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(here, '../../../../.env') })

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  // External (off-LAN) session idle window — short, re-auth required after it lapses.
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  // Local (on-LAN) session idle window + hard cap on the session JWT.
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  // Comma-separated CIDRs treated as the local network: on-LAN clients get the
  // longer (refresh) idle window, off-LAN clients the short (access) one. See spec §11.
  LOCAL_NETWORK_CIDRS: z
    .string()
    .default('127.0.0.1/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16')
    .transform((value) =>
      value
        .split(',')
        .map((cidr) => cidr.trim())
        .filter(Boolean),
    ),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
  // Cron expression for refreshing external calendar feeds (spec §8.10). The API
  // must run single-instance or this double-fires (spec §4). Default: every 30 min.
  CALENDAR_SYNC_CRON: z.string().default('*/30 * * * *'),
  // Cron expression for refreshing external bin sources (spec §10 Phase 5.6).
  // Same single-instance caveat as above. Default: daily at 03:00 (schedules
  // change at most weekly, so a nightly self-correct is plenty).
  BIN_SYNC_CRON: z.string().default('0 3 * * *'),
  // Cron expression for the scheduled reminder push (spec §8.13, §10 Phase 8).
  // Runs hourly; the engine acts only at its morning/evening slot hours, so each
  // reminder fires once a day (single-instance caveat as above). Default: hourly.
  NOTIFICATION_CRON: z.string().default('0 * * * *'),
  // Public base URL CalDAV clients should use (spec §10 Phase 5.5), e.g.
  // https://calendar.example.com. Shown in the app's CalDAV setup. Leave unset to
  // fall back to the server's detected LAN address (handy for local testing).
  CALDAV_PUBLIC_URL: z.string().url().optional().or(z.literal('')),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  // Fail fast with a readable message before anything else boots.
  console.error('❌ Invalid environment configuration:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
