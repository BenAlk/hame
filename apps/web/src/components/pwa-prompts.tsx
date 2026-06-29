import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { CloudOff, RefreshCw } from 'lucide-react'

/** Track the browser's online/offline state via the native events. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/**
 * App-wide PWA affordances (spec §10 Phase 7.4): a bottom "you're offline"
 * banner (the SPA shell is precached, so Hame keeps running and shows the last
 * loaded data) and a "new version ready" reload prompt, surfaced by the service
 * worker's `useRegisterSW`. Both are quiet bottom toasts so they never disturb
 * the wall-tablet layout. With the SW disabled (dev / no support) these stay
 * silent — `needRefresh` never fires.
 */
export function PwaPrompts() {
  const online = useOnline()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const showOffline = !online
  if (!showOffline && !needRefresh) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4">
      {showOffline && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2 text-sm text-ink shadow-ambient"
        >
          <CloudOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>You&rsquo;re offline — showing the last loaded data.</span>
        </div>
      )}
      {needRefresh && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink shadow-ambient"
        >
          <RefreshCw className="size-4 shrink-0 text-accent" aria-hidden />
          <span>A new version of Hame is ready.</span>
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="rounded-control bg-accent px-3 py-1.5 text-xs font-semibold text-white"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="rounded-control px-2 py-1.5 text-xs text-muted-foreground hover:text-ink"
          >
            Later
          </button>
        </div>
      )}
    </div>
  )
}
