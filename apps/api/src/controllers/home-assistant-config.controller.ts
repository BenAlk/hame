import type { RequestHandler } from 'express'
import type { TestHomeAssistantInput, UpdateHomeAssistantConfigInput } from '@hame/shared'
import {
  getHomeAssistantConfig,
  testHomeAssistant,
  updateHomeAssistantConfig,
} from '../services/home-assistant-config.service.js'
import { haClient } from '../integrations/home-assistant/index.js'

export const getHomeAssistantConfigController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getHomeAssistantConfig())
  } catch (err) {
    next(err)
  }
}

export const updateHomeAssistantConfigController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateHomeAssistantConfig(req.body as UpdateHomeAssistantConfigInput))
  } catch (err) {
    next(err)
  }
}

export const testHomeAssistantController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await testHomeAssistant(req.body as TestHomeAssistantInput))
  } catch (err) {
    next(err)
  }
}

/** Current dashboard-relevant entity states (spec §10 Phase 6.2). */
export const getHomeAssistantEntitiesController: RequestHandler = (_req, res) => {
  res.json(haClient.getEntities())
}

/**
 * Server-Sent Events stream of live entity changes (spec §10 Phase 6.2). One-way
 * push; the browser reads it with `EventSource`. Commands ride normal REST.
 */
export const homeAssistantStreamController: RequestHandler = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable proxy buffering so events flush immediately (nginx).
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 5000\n\n') // hint the browser's auto-reconnect interval

  const unsubscribe = haClient.onEntityUpdate((entity) => {
    res.write(`data: ${JSON.stringify(entity)}\n\n`)
  })
  // Heartbeat comment keeps the connection alive through idle-timeout proxies.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
    res.end()
  })
}
