import type { RequestHandler } from 'express'
import type {
  HaServiceCallInput,
  SmartHomeEntityIdsInput,
  TestHomeAssistantInput,
  UpdateHomeAssistantConfigInput,
  UpdateSmartHomeSettingsInput,
} from '@hame/shared'
import {
  callHomeAssistantService,
  getHomeAssistantConfig,
  listHomeAssistantCalendars,
  testHomeAssistant,
  updateHomeAssistantConfig,
} from '../services/home-assistant-config.service.js'
import {
  addSmartHomeControls,
  dismissSmartHomeSuggestions,
  getSmartHomeSettings,
  getSmartHomeSuggestions,
  updateSmartHomeSettings,
} from '../services/smart-home.service.js'
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

/** Relay a device control to HA over the live socket (spec §10 Phase 6.3). */
export const controlHomeAssistantController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await callHomeAssistantService(req.body as HaServiceCallInput))
  } catch (err) {
    next(err)
  }
}

/** List HA calendar entities for the calendar-source picker (spec §10 Phase 6.3). */
export const getHomeAssistantCalendarsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await listHomeAssistantCalendars())
  } catch (err) {
    next(err)
  }
}

/** The household's curated smart-home control list (spec §10 Phase 6.3). */
export const getSmartHomeSettingsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getSmartHomeSettings())
  } catch (err) {
    next(err)
  }
}

/** Replace the curated smart-home control list (the Smart-home page's Save). */
export const updateSmartHomeSettingsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateSmartHomeSettings(req.body as UpdateSmartHomeSettingsInput))
  } catch (err) {
    next(err)
  }
}

/** New controllable devices to offer on the dashboard prompt (spec §10 Phase 6.3). */
export const getSmartHomeSuggestionsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getSmartHomeSuggestions())
  } catch (err) {
    next(err)
  }
}

/** Add suggested devices to the widget (the prompt's "Add"). */
export const addSmartHomeControlsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await addSmartHomeControls((req.body as SmartHomeEntityIdsInput).entityIds))
  } catch (err) {
    next(err)
  }
}

/** Dismiss suggested devices without adding them (the prompt's "Dismiss"). */
export const dismissSmartHomeSuggestionsController: RequestHandler = async (req, res, next) => {
  try {
    await dismissSmartHomeSuggestions((req.body as SmartHomeEntityIdsInput).entityIds)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
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
