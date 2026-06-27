import { z } from 'zod'

/**
 * Household WiFi credentials for the dashboard's WiFi QR widget (spec §8.12,
 * §10 Phase 7.2). A singleton mirroring the Home Assistant / Immich config
 * pattern. The password is AES-256-GCM encrypted at rest (spec §11); it is
 * decrypted only for the member-level read that feeds the QR — the code is shown
 * openly on the wall tablet, so it isn't hidden from signed-in members, but it
 * never sits in the database as plaintext.
 */

/** WiFi authentication type, mapped to the QR payload's `T:` field. */
export const WIFI_SECURITY_TYPES = ['WPA', 'WEP', 'NONE'] as const
export type WifiSecurity = (typeof WIFI_SECURITY_TYPES)[number]
export const WifiSecuritySchema = z.enum(WIFI_SECURITY_TYPES)

/**
 * Admin write shape. `password` is required for a secured network and ignored
 * for an open one; the form prefills it from the read shape (it's shown openly
 * as a QR anyway), so there is no "leave blank to keep" dance.
 */
export const UpdateWifiConfigSchema = z
  .object({
    ssid: z.string().trim().min(1, 'Network name is required').max(64),
    password: z.string().max(63).default(''),
    security: WifiSecuritySchema.default('WPA'),
    hidden: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.security === 'NONE' || v.password.length > 0, {
    message: 'A password is required for a secured network',
    path: ['password'],
  })
export type UpdateWifiConfigInput = z.infer<typeof UpdateWifiConfigSchema>

/**
 * Member read shape feeding the widget. `configured` is true once a network name
 * is set; `isLocalClient` is true when the request came from the local network
 * (spec §11). The decrypted `password` is included only for a local client — the
 * QR is shown openly in the home, but the credentials never travel to a remote
 * (e.g. Cloudflare) client. The widget renders only when configured, active and
 * local.
 */
export const WifiConfigSchema = z.object({
  ssid: z.string(),
  password: z.string(),
  security: WifiSecuritySchema,
  hidden: z.boolean(),
  isActive: z.boolean(),
  configured: z.boolean(),
  isLocalClient: z.boolean(),
  updatedAt: z.coerce.date(),
})
export type WifiConfig = z.infer<typeof WifiConfigSchema>

/** Escape the WiFi-QR reserved characters (`\ ; , : "`) with a backslash. */
function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1')
}

/**
 * Build the de-facto-standard WiFi QR payload that Android/iOS cameras read to
 * join a network, e.g. `WIFI:T:WPA;S:MyNet;P:secret;;`. An open network omits
 * the password and uses `T:nopass`; a hidden SSID adds `H:true`.
 */
export function buildWifiQrPayload(config: {
  ssid: string
  password: string
  security: WifiSecurity
  hidden: boolean
}): string {
  const type = config.security === 'NONE' ? 'nopass' : config.security
  const parts = [`T:${type}`, `S:${escapeWifiValue(config.ssid)}`]
  if (config.security !== 'NONE') parts.push(`P:${escapeWifiValue(config.password)}`)
  if (config.hidden) parts.push('H:true')
  return `WIFI:${parts.join(';')};;`
}
