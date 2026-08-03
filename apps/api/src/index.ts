import { createApp } from './app.js'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { prisma } from './lib/prisma.js'
import { generateSetupToken } from './lib/setup-token.js'
import { startCalendarSyncJob, stopCalendarSyncJob } from './jobs/calendar-sync.job.js'
import { startBinSyncJob, stopBinSyncJob } from './jobs/bin-sync.job.js'
import { startNotificationJob, stopNotificationJob } from './jobs/notification.job.js'
import { startIntegrationSyncJob, stopIntegrationSyncJob } from './jobs/integration-sync.job.js'
import { startBackupJob, stopBackupJob } from './jobs/backup.job.js'
import { startNoteSweepJob, stopNoteSweepJob } from './jobs/note-sweep.job.js'
import { startHomeAssistant, stopHomeAssistant } from './integrations/home-assistant/index.js'
import { flushPendingRestores } from './integrations/home-assistant/alert-escalation.js'

const app = createApp()

const server = app.listen(env.API_PORT, () => {
  logger.info(`🏠 Hame API listening on http://localhost:${env.API_PORT}`)
})

startCalendarSyncJob()
startBinSyncJob()
startNotificationJob()
startIntegrationSyncJob()
startBackupJob()
startNoteSweepJob()
void startHomeAssistant()

/**
 * On first-run boot (no users yet), mint a setup token and print it prominently
 * so the operator can complete the setup wizard — see spec §8.1 / setup-token.ts.
 */
async function announceSetupTokenIfNeeded() {
  try {
    const userCount = await prisma.user.count()
    if (userCount > 0) return
    const token = generateSetupToken()
    logger.warn(
      `\n${'─'.repeat(64)}\n` +
        `  Hame first-run setup\n` +
        `  Open the app and enter this one-time setup token:\n\n` +
        `      ${token}\n\n` +
        `  It won't be shown again; on restart a new one is printed here.\n` +
        `${'─'.repeat(64)}`,
    )
  } catch (err) {
    logger.error({ err }, 'Could not check first-run setup status')
  }
}

void announceSetupTokenIfNeeded()

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down...`)
  stopCalendarSyncJob()
  stopBinSyncJob()
  stopNotificationJob()
  stopIntegrationSyncJob()
  stopBackupJob()
  stopNoteSweepJob()
  // Put back any phone an alert turned up (§10 Phase 21) before the socket goes,
  // so a deploy inside the restore window doesn't strand one at full volume.
  await flushPendingRestores()
  stopHomeAssistant()
  server.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
