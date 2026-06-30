import { create } from 'zustand'

/**
 * In-app toast notifications (spec §8.13, §10 Phase 8.1) — immediate feedback
 * for actions taken while a user is active at the screen. Time-based reminders
 * (bins, chores) go out over Home Assistant push instead (§8.13, Phase 8.2);
 * these are the "you're here, you did a thing" half.
 *
 * A tiny Zustand store plus a standalone `toast` helper so any module (a hook,
 * a mutation `onError`) can fire one without React context.
 */

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastState {
  toasts: Toast[]
  /** Add a toast and auto-dismiss it after `durationMs`. Returns its id. */
  add: (tone: ToastTone, message: string, durationMs?: number) => number
  dismiss: (id: number) => void
}

/** Errors linger a touch longer than confirmations — they may need reading. */
const DEFAULT_DURATION_MS: Record<ToastTone, number> = {
  success: 3_000,
  info: 4_000,
  error: 6_000,
}

let nextId = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (tone, message, durationMs) => {
    const id = ++nextId
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }] }))
    const ms = durationMs ?? DEFAULT_DURATION_MS[tone]
    if (ms > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
      }, ms)
    }
    return id
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/**
 * Context-free entry point — call from anywhere (`toast.success('Saved')`).
 * Components read the live list via `useToastStore`; this just enqueues.
 */
export const toast = {
  success: (message: string, durationMs?: number) =>
    useToastStore.getState().add('success', message, durationMs),
  error: (message: string, durationMs?: number) =>
    useToastStore.getState().add('error', message, durationMs),
  info: (message: string, durationMs?: number) =>
    useToastStore.getState().add('info', message, durationMs),
}
