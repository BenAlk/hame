import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast, useToastStore } from './toast'

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('enqueues a toast with a tone and message', () => {
    toast.success('Saved')
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ tone: 'success', message: 'Saved' })
  })

  it('assigns each toast a distinct id', () => {
    toast.info('one')
    toast.info('two')
    const ids = useToastStore.getState().toasts.map((t) => t.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('auto-dismisses after the tone default duration', () => {
    toast.success('gone soon') // success default 3s
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(3_000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('keeps errors longer than confirmations', () => {
    toast.success('ok')
    toast.error('bad')
    vi.advanceTimersByTime(3_000) // success window elapses, error remains
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('bad')
  })

  it('dismiss removes a specific toast immediately', () => {
    const id = toast.info('manual')
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('a zero duration disables auto-dismiss', () => {
    toast.info('sticky', 0)
    vi.advanceTimersByTime(60_000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })
})
