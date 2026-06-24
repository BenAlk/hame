import { logger } from '../../lib/logger.js'
import { getConnectionSettings } from '../../services/home-assistant-config.service.js'
import { haClient } from './client.js'

export { haClient } from './client.js'

/**
 * Open the Home Assistant connection at boot if the saved config is active
 * (spec §8.11). Never throws — a missing or unreachable HA just leaves the
 * client disconnected, to be retried when reachable or reconfigured.
 */
export async function startHomeAssistant(): Promise<void> {
  try {
    const settings = await getConnectionSettings()
    if (settings) {
      haClient.start(settings)
      logger.info('Home Assistant client starting')
    }
  } catch (err) {
    logger.warn({ err }, 'Could not start Home Assistant client')
  }
}

export function stopHomeAssistant(): void {
  haClient.stop()
}
