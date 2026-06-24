import { createApp } from './app.js'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { prisma } from './lib/prisma.js'
import { startCalendarSyncJob, stopCalendarSyncJob } from './jobs/calendar-sync.job.js'
import { startBinSyncJob, stopBinSyncJob } from './jobs/bin-sync.job.js'
import { startHomeAssistant, stopHomeAssistant } from './integrations/home-assistant/index.js'

const app = createApp()

const server = app.listen(env.API_PORT, () => {
  logger.info(`🏠 Hame API listening on http://localhost:${env.API_PORT}`)
})

startCalendarSyncJob()
startBinSyncJob()
void startHomeAssistant()

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down...`)
  stopCalendarSyncJob()
  stopBinSyncJob()
  stopHomeAssistant()
  server.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
