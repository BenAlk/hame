import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
}

/**
 * Lightweight modal dialog (no Radix dependency yet): centred surface panel on
 * a dimmed backdrop, closes on Escape or backdrop click. Used for flows like
 * the shopping-list archive (spec §8.3).
 */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-lg rounded-card border border-line bg-surface p-6 text-ink shadow-ambient',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-medium">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-control p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
