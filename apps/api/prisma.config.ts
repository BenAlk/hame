import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { defineConfig } from '@prisma/config'

// Prisma config disables automatic .env loading, so load the repo-root .env
// ourselves (single source of truth for DATABASE_URL etc.).
const here = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(here, '../../.env') })

export default defineConfig({
  schema: resolve(here, 'prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
