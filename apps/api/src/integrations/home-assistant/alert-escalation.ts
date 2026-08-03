import type { DeviceAudioState, EscalationStep, VolumeReading } from '@hame/shared'
import { deviceSensorIds, isEscalationPossible, planEscalation } from '@hame/shared'
import type { HaEntityState } from '@hame/shared'
import { logger } from '../../lib/logger.js'
import { haClient } from './client.js'
import { sendHaNotification } from './notifications.js'

/**
 * The impure half of the alert break-through (spec §8.13, §10 Phase 21) — reading
 * a phone's current audio state, and driving the escalate → alert → unwind
 * sequence. The decision of *what* to change and how to put it back is the pure
 * `planEscalation` in `@hame/shared`; this file only reads, sends and unwinds,
 * the same split as the reminder engine and the HA protocol helpers.
 *
 * Reads come from the Phase 6.2 in-memory entity registry rather than a fresh
 * HTTP call: `sensor` has been a dashboard domain since that phase, so a phone's
 * volume/ringer/DND sensors are already streaming into Hame the moment the
 * household enables them in the Companion app. Nothing new is polled or stored.
 *
 * Writes ride `notify.<service>` — a Companion-app device command is a
 * notification payload, not a `call_service` — so the Phase 6.3/20 service
 * allowlist is deliberately untouched by this feature. The service name comes
 * from the recipient's own stored `haNotifyService` and every payload is built
 * from the closed set in `planEscalation`, so nothing user-supplied reaches HA.
 */

/**
 * How long the phone stays turned up before it is put back. Long enough for the
 * alert tone to play out and be noticed, and no longer — this window is the whole
 * exposure of the one failure mode the unwind can't close (a hard kill, which
 * `flushPendingRestores` can't catch), so it is deliberately kept short.
 */
const RESTORE_DELAY_MS = 20_000

/** A scheduled unwind, kept so shutdown can run it rather than abandon it. */
interface PendingRestore {
  timer: NodeJS.Timeout
  run: () => Promise<void>
}

const pendingRestores = new Set<PendingRestore>()

interface HaSettings {
  url: string
  token: string
}

/**
 * Read one phone's audio state from the entity registry.
 *
 * Every field is independently nullable and independently resolved: a household
 * that enabled only the volume sensors gets the volume rung and nothing else.
 * A missing entity, an entity HA hasn't resolved yet, or a non-numeric volume all
 * read as `null`, which `planEscalation` treats as "leave that setting alone".
 */
export function readDeviceAudioState(notifyService: string): DeviceAudioState {
  const ids = deviceSensorIds(notifyService)
  return {
    dnd: readSensorState(ids.dnd),
    ringerMode: readSensorState(ids.ringerMode),
    notificationVolume: readVolume(ids.notificationVolume),
    alarmVolume: readVolume(ids.alarmVolume),
  }
}

/** Whether a recipient's phone can actually be turned up right now. */
export function canBreakThrough(notifyService: string): boolean {
  return isEscalationPossible(readDeviceAudioState(notifyService))
}

function readSensorState(entityId: string): string | null {
  return haClient.getEntity(entityId)?.state ?? null
}

/**
 * A volume sensor's level plus the stream's own maximum, which the Companion app
 * publishes as a `max` attribute. Both are required: without the device's own
 * ceiling Hame would be guessing how loud "loud" is on that handset, and the
 * ceiling differs per stream and per manufacturer.
 */
function readVolume(entityId: string): VolumeReading | null {
  const entity = haClient.getEntity(entityId)
  if (!entity) return null
  const level = Number(entity.state)
  const max = readMax(entity)
  if (!Number.isFinite(level) || max === null) return null
  return { level, max }
}

function readMax(entity: HaEntityState): number | null {
  const raw = entity.attributes.max
  const max = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(max) && max > 0 ? max : null
}

/**
 * Turn a phone up for one alert, then put it back.
 *
 * `send` is the caller's own delivery of the alert itself, run between the two
 * halves so the phone is loud at exactly the moment the notification lands. Its
 * result is passed straight back, so break-through never changes what the caller
 * reports about delivery.
 *
 * The unwind is scheduled rather than awaited — the alert has already been sent
 * and the sender shouldn't be held for it. That does mean an API
 * restart inside the window leaves the phone turned up, so shutdown runs any
 * pending unwind on the way out (`flushPendingRestores`), and the household is
 * told plainly in the README that a crash mid-window is the one case that can
 * leave a phone loud.
 */
export async function withBreakThrough<T>(
  settings: HaSettings,
  notifyService: string,
  send: () => Promise<T>,
): Promise<T> {
  const plan = planEscalation(readDeviceAudioState(notifyService))
  if (plan.escalate.length === 0) return send()

  await runSteps(settings, notifyService, plan.escalate, 'escalate')
  try {
    return await send()
  } finally {
    scheduleRestore(settings, notifyService, plan.restore)
  }
}

function scheduleRestore(
  settings: HaSettings,
  notifyService: string,
  restore: EscalationStep[],
): void {
  if (restore.length === 0) return
  const run = () => runSteps(settings, notifyService, restore, 'restore')
  const pending: PendingRestore = {
    timer: setTimeout(() => {
      pendingRestores.delete(pending)
      void run()
    }, RESTORE_DELAY_MS),
    run,
  }
  pendingRestores.add(pending)
}

/**
 * Run every pending unwind now — called on shutdown so a deploy or restart inside
 * the restore window doesn't strand a phone at full volume with DND lifted. Best
 * effort by nature: a hard kill still can't put a phone back, which is why the
 * window is 20 seconds rather than minutes.
 */
export async function flushPendingRestores(): Promise<void> {
  const pending = [...pendingRestores]
  pendingRestores.clear()
  for (const { timer, run } of pending) {
    clearTimeout(timer)
    await run()
  }
}

/**
 * Send one half of the plan in order. Each step is awaited so the phone is
 * already lifted before the alert follows, and a failure is logged and stepped
 * over rather than thrown: a phone that refused one command should still get the
 * alert, and a half-applied escalation must still attempt its whole unwind.
 */
async function runSteps(
  settings: HaSettings,
  notifyService: string,
  steps: EscalationStep[],
  phase: 'escalate' | 'restore',
): Promise<void> {
  for (const step of steps) {
    const ok = await sendHaNotification(settings.url, settings.token, notifyService, {
      message: step.message,
      data: step.data,
    })
    if (!ok) logger.warn({ phase, command: step.message }, 'Alert break-through step rejected')
  }
}
