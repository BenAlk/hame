import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** The confirmation prompt — plain text or rich content. */
  children: React.ReactNode
  confirmLabel?: string
  pendingLabel?: string
  /** Disable the confirm button while the action is in flight. */
  pending?: boolean
  /** Error from a failed attempt, shown above the buttons. */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
  /** Style the confirm button as destructive (default true). */
  destructive?: boolean
}

/**
 * In-app confirmation dialog for destructive actions, replacing the browser's
 * native `confirm()` prompt with a Hearth-styled modal. Mirrors the admin
 * delete-member flow so every "are you sure?" looks the same.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting…',
  pending = false,
  error,
  onConfirm,
  onCancel,
  destructive = true,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-sm text-ink">{children}</div>
      {error && <p className="mt-3 text-sm text-warning">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'default'}
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
