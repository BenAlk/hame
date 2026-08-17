import { useEffect } from 'react'

/**
 * Hold a Screen Wake Lock so the wall tablet's screen never dims/locks on its
 * own timeout (spec §8.14a) — this is the other half of what the retired
 * FreeKiosk kiosk app did, alongside the sleep-mode schedule. Feature-detected
 * (no-op where the API is unavailable, e.g. iOS Safari) and re-requested on
 * `visibilitychange`, since a lock is released automatically whenever the
 * document goes hidden and the API gives no way to pre-empt that. `enabled`
 * gates whether a lock is held at all, so a caller can scope it (e.g. to the
 * wall tablet's own dashboard) without conditionally calling the hook.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void lock.release()
          return
        }
        sentinel = lock
      } catch {
        // Denied (e.g. backgrounded tab, low battery) — nothing to do; the
        // visibilitychange listener below will retry once relevant again.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && !sentinel) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void sentinel?.release()
    }
  }, [enabled])
}
