import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'

const upsert = vi.fn()
const reload = vi.fn()
const getStatus = vi.fn(() => ({ status: 'connected', haVersion: '2026.6.1', lastError: null }))
const callService = vi.fn()
const getEntity = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { homeAssistantConfig: { upsert, findUnique: vi.fn(), updateMany: vi.fn() } },
}))
vi.mock('../integrations/home-assistant/client.js', () => ({
  haClient: { reload, getStatus, callService, getEntity },
}))
vi.mock('../integrations/home-assistant/test-connection.js', () => ({
  testHomeAssistantConnection: vi.fn(),
}))

const { callHomeAssistantService, getHomeAssistantConfig, updateHomeAssistantConfig } =
  await import('../services/home-assistant-config.service.js')

/** A climate entity as the live registry would hold it. */
function climateEntity(attributes: Record<string, unknown> = {}) {
  return {
    entityId: 'climate.hallway',
    domain: 'climate',
    state: 'heat',
    friendlyName: 'Hallway',
    attributes: { min_temp: 7, max_temp: 24, target_temp_step: 0.5, ...attributes },
    lastChanged: null,
  }
}

function row(over: Record<string, unknown> = {}) {
  return {
    url: 'http://ha.test',
    accessToken: null,
    isActive: false,
    lastConnectedAt: null,
    updatedAt: new Date(),
    ...over,
  }
}

beforeEach(() => {
  upsert.mockReset()
  reload.mockReset()
  callService.mockReset()
  callService.mockResolvedValue(undefined)
  getEntity.mockReset()
  getEntity.mockReturnValue(null)
})

describe('callHomeAssistantService', () => {
  it('relays an argument-less control with no service data attached', async () => {
    const result = await callHomeAssistantService({
      domain: 'light',
      service: 'toggle',
      entityId: 'light.kitchen',
    })
    expect(result.ok).toBe(true)
    expect(callService).toHaveBeenCalledWith('light', 'toggle', 'light.kitchen', undefined)
  })

  it('drops arguments aimed at a service that takes none', async () => {
    await callHomeAssistantService({
      domain: 'light',
      service: 'toggle',
      entityId: 'light.kitchen',
      data: { brightness: 255 },
    })
    expect(callService).toHaveBeenCalledWith('light', 'toggle', 'light.kitchen', undefined)
  })

  it('holds a setpoint inside the device’s own range, not just the envelope', async () => {
    getEntity.mockReturnValue(climateEntity())
    // 30 clears the schema envelope (35) but this thermostat stops at 24.
    await callHomeAssistantService({
      domain: 'climate',
      service: 'set_temperature',
      entityId: 'climate.hallway',
      data: { temperature: 30 },
    })
    expect(callService).toHaveBeenCalledWith('climate', 'set_temperature', 'climate.hallway', {
      temperature: 24,
    })
  })

  it('rounds a setpoint onto the device’s step', async () => {
    getEntity.mockReturnValue(climateEntity())
    await callHomeAssistantService({
      domain: 'climate',
      service: 'set_temperature',
      entityId: 'climate.hallway',
      data: { temperature: 20.3 },
    })
    expect(callService).toHaveBeenCalledWith('climate', 'set_temperature', 'climate.hallway', {
      temperature: 20.5,
    })
  })

  it('still relays when the entity is not in the registry — HA is the final authority', async () => {
    getEntity.mockReturnValue(null)
    const result = await callHomeAssistantService({
      domain: 'climate',
      service: 'set_temperature',
      entityId: 'climate.hallway',
      data: { temperature: 21 },
    })
    expect(result.ok).toBe(true)
    expect(callService).toHaveBeenCalledWith('climate', 'set_temperature', 'climate.hallway', {
      temperature: 21,
    })
  })

  it('passes an hvac mode through untouched', async () => {
    await callHomeAssistantService({
      domain: 'climate',
      service: 'set_hvac_mode',
      entityId: 'climate.hallway',
      data: { hvac_mode: 'off' },
    })
    expect(callService).toHaveBeenCalledWith('climate', 'set_hvac_mode', 'climate.hallway', {
      hvac_mode: 'off',
    })
  })

  it('refuses an allowlisted domain aimed at another domain’s entity', async () => {
    await expect(
      callHomeAssistantService({
        domain: 'light',
        service: 'turn_off',
        entityId: 'climate.hallway',
      }),
    ).rejects.toThrow(/does not belong/i)
    expect(callService).not.toHaveBeenCalled()
  })

  it('refuses a service outside the allowlist before touching the socket', async () => {
    await expect(
      callHomeAssistantService({ domain: 'lock', service: 'unlock', entityId: 'lock.front' }),
    ).rejects.toThrow(/not permitted/i)
    expect(callService).not.toHaveBeenCalled()
  })

  it('degrades to a structured failure when the socket rejects', async () => {
    callService.mockRejectedValue(new Error('Home Assistant is not connected'))
    const result = await callHomeAssistantService({
      domain: 'climate',
      service: 'set_hvac_mode',
      entityId: 'climate.hallway',
      data: { hvac_mode: 'heat' },
    })
    expect(result).toEqual({ ok: false, message: 'Home Assistant is not connected' })
  })
})

describe('getHomeAssistantConfig', () => {
  it('exposes only whether a token is stored, never the token, and overlays live status', async () => {
    upsert.mockResolvedValue(row({ accessToken: 'ciphertext-blob' }))
    const config = await getHomeAssistantConfig()
    expect(config.hasToken).toBe(true)
    expect(config).not.toHaveProperty('accessToken')
    expect(config.status).toBe('connected')
    expect(config.haVersion).toBe('2026.6.1')
  })

  it('reports hasToken=false when no token is stored', async () => {
    upsert.mockResolvedValue(row({ accessToken: null }))
    expect((await getHomeAssistantConfig()).hasToken).toBe(false)
  })
})

describe('updateHomeAssistantConfig', () => {
  it('encrypts the token at rest (never stores plaintext) and reconnects', async () => {
    // The returned row carries a real ciphertext, as the DB would after the write.
    upsert.mockResolvedValue(row({ accessToken: encryptSecret('plain-token'), isActive: true }))
    await updateHomeAssistantConfig({
      url: 'http://ha.test',
      accessToken: 'plain-token',
      isActive: true,
    })

    const stored = upsert.mock.calls[0][0].update.accessToken as string
    expect(stored).not.toBe('plain-token')
    expect(decryptSecret(stored)).toBe('plain-token')
    // Reconnects with the decrypted settings.
    expect(reload).toHaveBeenCalledWith({ url: 'http://ha.test', token: 'plain-token' })
  })

  it('leaves the stored token untouched when none is supplied', async () => {
    upsert.mockResolvedValue(row({ accessToken: encryptSecret('existing'), isActive: true }))
    await updateHomeAssistantConfig({ url: 'http://ha.test', isActive: true })
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('accessToken')
  })
})
