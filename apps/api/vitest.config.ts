import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Valid env so lib/env.ts passes validation without a real .env present.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://hame:hame@localhost:5432/hame_test?schema=public',
      CORS_ORIGINS: 'http://localhost:5173',
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      ENCRYPTION_KEY: '0'.repeat(64),
    },
  },
})
