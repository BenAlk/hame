import { useMemo, useState } from 'react'
import { BellRing } from 'lucide-react'
import type { AlertRecipient } from '@hame/shared'
import { useAlertRecipients, useSendAlert } from '@/api/alerts'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { toast } from '@/stores/toast'
import { cn } from '@/lib/utils'

const MESSAGE_MAX_LENGTH = 200

/**
 * The mobile top-bar critical-alert "poke" (spec §10 Phase 12). Sends a short,
 * urgent message to another household member's phone as a critical push via Home
 * Assistant. Renders nothing unless the household toggle is on, HA is connected,
 * and there is at least one other member — so a non-HA household, the wall tablet,
 * or a house that turned it off never sees the icon.
 */
export function AlertButton() {
  const { data } = useAlertRecipients()
  const [open, setOpen] = useState(false)

  if (!data || !data.enabled || !data.haConfigured || data.recipients.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Alert the household"
        className="ml-auto rounded-control p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <BellRing className="h-5 w-5" aria-hidden />
      </button>
      {open && <AlertModal recipients={data.recipients} onClose={() => setOpen(false)} />}
    </>
  )
}

function AlertModal({
  recipients,
  onClose,
}: {
  recipients: AlertRecipient[]
  onClose: () => void
}) {
  const send = useSendAlert()
  // With exactly one other member there's nothing to pick — go straight to them.
  const single = recipients.length === 1 ? recipients[0] : null
  const [selectedId, setSelectedId] = useState<string | null>(single?.id ?? null)
  const [message, setMessage] = useState('')

  const selected = useMemo(
    () => recipients.find((r) => r.id === selectedId) ?? null,
    [recipients, selectedId],
  )
  const canSubmit =
    !!selected && selected.canReceive && message.trim().length > 0 && !send.isPending

  function submit() {
    if (!selected) return
    send.mutate(
      { recipientId: selected.id, message: message.trim() },
      {
        onSuccess: (res) => {
          if (res.delivered) {
            toast.success(`Alert sent to ${selected.firstName}.`)
            onClose()
          } else {
            toast.error(`Couldn’t reach ${selected.firstName} — they haven’t set up their phone.`)
          }
        },
        onError: () => toast.error('Could not send the alert. Try again.'),
      },
    )
  }

  return (
    <Modal open onClose={onClose} title="Alert the household" className="max-w-md">
      <div className="flex flex-col gap-4">
        {single ? (
          <p className="text-sm text-muted-foreground">
            Send an urgent alert to <span className="font-medium text-ink">{single.firstName}</span>
            {!single.canReceive && ' — they haven’t set up their phone in Profile yet.'}
          </p>
        ) : (
          <div className="flex flex-col gap-1 rounded-control border border-input bg-surface p-1">
            {recipients.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={!r.canReceive}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink transition-colors',
                  r.canReceive ? 'hover:bg-muted' : 'cursor-not-allowed opacity-50',
                  selectedId === r.id && 'bg-accent-soft text-accent',
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.colour }}
                  aria-hidden
                />
                {r.firstName}
                {!r.canReceive && (
                  <span className="ml-auto text-xs text-muted-foreground">no phone set up</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div>
          <textarea
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={3}
            placeholder="Dinner’s ready…"
            className="w-full resize-none rounded-control border border-input bg-surface p-3 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {message.length}/{MESSAGE_MAX_LENGTH}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Delivered as a critical alert — it rings through silent mode and Do Not Disturb.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {send.isPending ? 'Sending…' : 'Send alert'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
