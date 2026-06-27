import type { UpdateWifiConfigInput, WifiConfig, WifiSecurity } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'

/** The WiFi config row is a singleton (spec §10 Phase 7.2), keyed by this id. */
const SINGLETON_ID = 'singleton'

interface ConfigRow {
  ssid: string
  password: string | null
  security: WifiSecurity
  hidden: boolean
  isActive: boolean
  updatedAt: Date
}

/**
 * Project a row to the read shape. The stored password is decrypted only for a
 * local-network client (spec §11) — the QR is shown openly in the home, but the
 * credentials never travel to a remote client.
 */
function toConfig(row: ConfigRow, isLocal: boolean): WifiConfig {
  return {
    ssid: row.ssid,
    password: isLocal && row.password ? decryptSecret(row.password) : '',
    security: row.security,
    hidden: row.hidden,
    isActive: row.isActive,
    configured: row.ssid.trim().length > 0,
    isLocalClient: isLocal,
    updatedAt: row.updatedAt,
  }
}

/** Fetch the WiFi config, creating the default (inactive) row on first access. */
export async function getWifiConfig(isLocal: boolean): Promise<WifiConfig> {
  const row = await prisma.wifiConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
  return toConfig(row, isLocal)
}

export async function updateWifiConfig(
  input: UpdateWifiConfigInput,
  isLocal: boolean,
): Promise<WifiConfig> {
  // Encrypt only a real password; an open network (or a cleared field) stores
  // null. The QR shows the code openly, but it never sits in the DB as plaintext.
  const password =
    input.security !== 'NONE' && input.password ? encryptSecret(input.password) : null

  const data = {
    ssid: input.ssid,
    password,
    security: input.security,
    hidden: input.hidden,
    isActive: input.isActive,
  }

  const row = await prisma.wifiConfig.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  })
  return toConfig(row, isLocal)
}
