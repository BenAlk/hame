import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'

// Load the repo-root .env so DATABASE_URL is available when run via tsx.
const here = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(here, '../../../.env') })

const prisma = new PrismaClient()

async function main() {
  const password = await argon2.hash('changeme123')

  const admin = await prisma.user.upsert({
    where: { username: 'ben' },
    update: {},
    create: {
      username: 'ben',
      password,
      name: 'Ben',
      colour: '#3B82F6',
      dob: new Date('1990-01-01'),
      role: 'ADMIN',
    },
  })

  console.log(`✅ Seeded admin user: ${admin.username} (password: changeme123)`)
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
