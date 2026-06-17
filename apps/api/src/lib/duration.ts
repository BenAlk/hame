const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
}

/**
 * Parse a short duration string (e.g. "15m", "7d", "1h", "30s", "2w") into
 * seconds. Used to size the network-aware session idle windows. Throws on a
 * malformed value so misconfiguration fails loudly rather than silently.
 */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)\s*([smhdw])$/.exec(value.trim())
  if (!match) {
    throw new Error(`Invalid duration: "${value}" (expected e.g. "15m", "7d")`)
  }
  return Number(match[1]) * UNIT_SECONDS[match[2]]
}
