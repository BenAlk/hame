import { CheckCircle2, Info, X, AlertTriangle } from 'lucide-react'
import { useToastStore, type ToastTone } from '@/stores/toast'

/**
 * The app-wide toast stack (spec §10 Phase 8.1). Mounted once at the root,
 * top-right so it clears the bottom PWA banners (`pwa-prompts.tsx`). Hearth
 * styling — `surface` paper card, hairline, a single ambient shadow, a small
 * tone-coloured geometric mark (design §1: status via colour + a mark, never
 * decoration). Auto-dismissal lives in the store; this only renders + lets a
 * user dismiss early.
 */

const TONE_ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const

/** Success leans on sage (the "good" secondary); error on warning; info accent. */
const TONE_COLOUR: Record<ToastTone, string> = {
  success: 'text-sage',
  error: 'text-warning',
  info: 'text-accent',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => {
        const Icon = TONE_ICON[t.tone]
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink shadow-ambient"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${TONE_COLOUR[t.tone]}`} aria-hidden />
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-mr-1 -mt-0.5 shrink-0 rounded-control p-1 text-muted-foreground hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
