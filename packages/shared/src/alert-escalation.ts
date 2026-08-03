/**
 * Alert break-through escalation (spec §8.13, §10 Phase 21).
 *
 * A household alert (§10 Phase 12) is sent as a critical push — `channel:
 * alarm_stream` on Android, `push.sound.critical` on iOS — and whether it makes a
 * noise is then entirely the handset's decision. On Android that decision is made
 * by a notification channel whose audio attributes are frozen the first time the
 * channel is created, and several manufacturers (Samsung most visibly) downgrade
 * those attributes so the alert plays as an ordinary notification. Nothing in the
 * payload can reach past that.
 *
 * So this module stops arguing with the channel. Instead of asking the phone to
 * treat a notification as an alarm, it briefly **moves the phone into a state
 * where an ordinary notification is already audible**, sends the alert, and puts
 * the phone back. That works the same way on every Android handset, because it
 * relies on the device commands the Companion app exposes rather than on any
 * manufacturer's interpretation of a channel.
 *
 * Two rules keep it honest, and both are enforced here rather than at the call
 * site:
 *
 * 1. **Read before write, or don't write.** A rung is planned only when its
 *    current value could be read back from Home Assistant, because that value is
 *    what the unwind restores. If a setting can't be read it isn't touched — Hame
 *    never leaves a phone in a state it can't undo, and a household that hasn't
 *    finished the setup silently falls back to the plain critical push rather
 *    than half-escalating.
 * 2. **Every rung is reversible.** `restore` is the exact inverse of `escalate`,
 *    in reverse order, built at the same moment from the same reading. The only
 *    step with nothing to put back (waking the screen) changes no setting.
 *
 * The first rule doubles as the **iOS guard**: these sensors exist only on the
 * Android Companion app, so an iOS recipient has nothing readable, plans no
 * rungs, and receives only the critical push — which is the correct behaviour for
 * iOS anyway, where `push.sound.critical` already breaks through properly. Without
 * it, sending a device command to an iPhone would post a notification whose body
 * read "command_volume_level".
 *
 * Pure and socket-free, like the recurrence, reminder and chore-stats engines:
 * the caller reads the sensors, this decides, the caller sends.
 */

/**
 * What Hame could read about one phone's audio state, from Home Assistant's
 * entity registry. Every field is nullable because every one of them is a sensor
 * the household has to enable in the Companion app (they are off by default), and
 * a `null` here means exactly one thing: leave that setting alone.
 */
export interface DeviceAudioState {
  /** `dnd_sensor` — `off`, `priority_only`, `alarms_only`, `total_silence`. */
  dnd: string | null
  /** `audio_sensor` — the ringer mode: `normal`, `vibrate`, `silent`. */
  ringerMode: string | null
  /** `volume_level_notification` — current level, with the stream's own maximum. */
  notificationVolume: VolumeReading | null
  /** `volume_level_alarm` — current level, with the stream's own maximum. */
  alarmVolume: VolumeReading | null
}

/** One volume stream's current level and the maximum that device allows on it. */
export interface VolumeReading {
  level: number
  /** The stream's own ceiling (the sensor's `max` attribute), device-specific. */
  max: number
}

/**
 * One reversible change, shaped as a Companion-app device command. These ride the
 * ordinary `notify.<service>` path (the same call as the alert itself) rather than
 * `call_service`, so the Phase 6.3/20 service allowlist is untouched — a device
 * command is a notification payload, not a service call. A well-formed command is
 * consumed silently by the app; a malformed one is *posted to the phone as a
 * notification*, which is why the shapes here are built only from this module.
 */
export interface EscalationStep {
  /** The command name, sent as the notification's `message`. */
  message: string
  /** The command's payload, sent as the notification's `data`. */
  data: Record<string, string | number>
}

/** An escalation and the exact unwind that puts the phone back afterwards. */
export interface EscalationPlan {
  /** Sent before the alert, in order. Empty when nothing could be read. */
  escalate: EscalationStep[]
  /** Sent after the alert, in order — the inverse of `escalate`, reversed. */
  restore: EscalationStep[]
}

/** The Companion app's device-command names, exactly as the app matches them. */
const COMMAND_DND = 'command_dnd'
const COMMAND_RINGER_MODE = 'command_ringer_mode'
const COMMAND_VOLUME_LEVEL = 'command_volume_level'
const COMMAND_SCREEN_ON = 'command_screen_on'

/** The two audio streams an alert can plausibly arrive on (see `planEscalation`). */
const NOTIFICATION_STREAM = 'notification_stream'
const ALARM_STREAM = 'alarm_stream'

/** The interruption filter that lets everything through. */
const DND_OFF = 'off'

/** The ringer mode that permits sound at all (vs `vibrate` / `silent`). */
const RINGER_NORMAL = 'normal'

/**
 * A sensor value Home Assistant couldn't resolve. Treated as unreadable rather
 * than as a state, so an entity that exists but hasn't reported yet doesn't get
 * mistaken for "already fine" and skipped, nor written to and restored to junk.
 */
const UNREADABLE_STATES = new Set(['unknown', 'unavailable', 'none', ''])

/**
 * Plan the break-through for one phone.
 *
 * Rungs are ordered by what blocks what: Do Not Disturb outranks the ringer mode,
 * which outranks the volume level, so they're lifted outermost-first and put back
 * innermost-first. Waking the screen goes last, once the phone can actually make
 * the noise.
 *
 * **Both** the notification and alarm streams are raised, because Hame cannot tell
 * from the server which one the alert will land on: on a handset that honours the
 * alarm channel it plays on the alarm stream, and on one that downgraded the
 * channel it plays on the notification stream. Raising both costs two silent
 * commands and removes the guess. (On stock Android before 14 the two are the same
 * stream — the second write is then a no-op that restores to the same value.)
 *
 * A rung whose setting is *already* permissive is skipped: there is no point
 * pushing `command_dnd: off` to a phone with Do Not Disturb off, and skipping it
 * keeps the unwind from writing a value the user might have changed meanwhile.
 */
export function planEscalation(state: DeviceAudioState): EscalationPlan {
  const escalate: EscalationStep[] = []
  const restore: EscalationStep[] = []

  const dnd = readState(state.dnd)
  if (dnd && dnd !== DND_OFF) {
    escalate.push(dndCommand(DND_OFF))
    restore.unshift(dndCommand(dnd))
  }

  const ringer = readState(state.ringerMode)
  if (ringer && ringer !== RINGER_NORMAL) {
    escalate.push(ringerCommand(RINGER_NORMAL))
    restore.unshift(ringerCommand(ringer))
  }

  for (const [stream, reading] of [
    [NOTIFICATION_STREAM, state.notificationVolume],
    [ALARM_STREAM, state.alarmVolume],
  ] as const) {
    if (!reading || reading.level >= reading.max) continue
    escalate.push(volumeCommand(stream, reading.max))
    restore.unshift(volumeCommand(stream, reading.level))
  }

  // Nothing readable — the phone is iOS, or its sensors are off. Fall back to the
  // plain critical push rather than firing commands blind.
  if (escalate.length === 0) return { escalate: [], restore: [] }

  // Only once something was lifted, and only on a device that has proven itself
  // Android by answering above. Nothing to undo — it changes no setting.
  escalate.push({ message: COMMAND_SCREEN_ON, data: {} })

  return { escalate, restore }
}

/** Whether a plan will do anything (used to report readiness before sending). */
export function isEscalationPossible(state: DeviceAudioState): boolean {
  return (
    readState(state.dnd) !== null ||
    readState(state.ringerMode) !== null ||
    state.notificationVolume !== null ||
    state.alarmVolume !== null
  )
}

/**
 * The Companion-app sensor entity ids for the phone behind a `notify.*` target.
 *
 * No new configuration is needed to find them: HA derives both a device's notify
 * service and its sensors' entity ids from the same slugified device name, so
 * `mobile_app_bens_phone` and `sensor.bens_phone_ringer_mode` share a stem. That
 * is the same slug correspondence Phase 8.2 already relies on to put friendly
 * device names on the notify-target picker.
 *
 * These are the *default* ids. A household that has renamed an entity by hand
 * breaks the correspondence, and the rung it belongs to is then simply unreadable
 * — which the read-before-write rule turns into "don't touch that setting",
 * degrading to the plain critical push rather than misfiring.
 */
export function deviceSensorIds(notifyService: string): Record<keyof DeviceAudioState, string> {
  const slug = notifyService.replace(/^mobile_app_/, '')
  return {
    dnd: `sensor.${slug}_do_not_disturb_sensor`,
    ringerMode: `sensor.${slug}_ringer_mode`,
    notificationVolume: `sensor.${slug}_volume_level_notification`,
    alarmVolume: `sensor.${slug}_volume_level_alarm`,
  }
}

/** Normalise a sensor state, mapping HA's non-answers to "couldn't read it". */
function readState(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim().toLowerCase()
  return UNREADABLE_STATES.has(trimmed) ? null : trimmed
}

function dndCommand(command: string): EscalationStep {
  return { message: COMMAND_DND, data: { command } }
}

function ringerCommand(command: string): EscalationStep {
  return { message: COMMAND_RINGER_MODE, data: { command } }
}

function volumeCommand(stream: string, level: number): EscalationStep {
  return { message: COMMAND_VOLUME_LEVEL, data: { media_stream: stream, command: level } }
}
