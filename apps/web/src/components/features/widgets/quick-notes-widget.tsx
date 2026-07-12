import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Check, Lock, Pin, Plus, Trash2 } from 'lucide-react'
import type { CreateNoteInput, Note, NoteAudience, PublicUser } from '@hame/shared'
import { NOTE_MAX_LENGTH } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useCurrentUser } from '@/api/auth'
import { useMembers } from '@/api/users'
import { useCreateNote, useDeleteNote, useDismissNote, useNotes, useUpdateNote } from '@/api/notes'
import { useDashboardOwner } from '@/components/features/dashboard/dashboard-owner'
import { cn } from '@/lib/utils'

/**
 * The QuickNotes "fridge board" widget (spec §8.16). Shows household notes on any
 * dashboard, plus the viewer's own direct notes on their **own** board only —
 * direct notes are hidden when the tile is rendered on the shared Household view
 * or another member's view, so a private note never surfaces on the wall tablet.
 * (The server already never sends another member's direct notes; this hides the
 * viewer's own when they're not looking at their own board.)
 */
export function QuickNotesWidget() {
  const { owner } = useDashboardOwner()
  const { data: notes, isPending } = useNotes()
  const [composing, setComposing] = useState(false)

  const visible = useMemo(
    () => (notes ?? []).filter((n) => owner === 'me' || n.audience === 'HOUSEHOLD'),
    [notes, owner],
  )

  return (
    <WidgetCard
      title="QuickNotes"
      action={
        <button
          onClick={() => setComposing(true)}
          aria-label="Add a note"
          className="rounded-control p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      }
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">The board’s clear. Add a note.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((note) => (
            <NoteRow key={note.id} note={note} />
          ))}
        </ul>
      )}
      {composing && <ComposeNoteModal onClose={() => setComposing(false)} />}
    </WidgetCard>
  )
}

/** One sticky note, tinted by its colour (falling back to the author's colour). */
function NoteRow({ note }: { note: Note }) {
  const del = useDeleteNote()
  const dismiss = useDismissNote()
  const update = useUpdateNote()
  const tint = note.colour ?? note.author.colour

  return (
    <li
      className="rounded-control border-l-[3px] p-2.5"
      style={{ borderLeftColor: tint, backgroundColor: `${tint}14` }}
    >
      <p className="whitespace-pre-wrap break-words text-sm text-ink">{note.body}</p>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        {note.pinned && <Pin className="size-3 shrink-0" aria-label="Pinned" />}
        {note.audience === 'DIRECT' && (
          <span className="inline-flex items-center gap-1 text-[color:var(--accent)]">
            <Lock className="size-3" aria-hidden />
            {note.mine && note.recipient ? `to ${note.recipient.firstName}` : 'private'}
          </span>
        )}
        <span className="truncate">{note.author.firstName}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">
          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
        </span>
        {note.mine && note.audience === 'DIRECT' && note.recipientSeenAt && (
          <span className="shrink-0 text-[color:var(--accent)]">Seen</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {note.mine ? (
            <>
              <button
                onClick={() => update.mutate({ id: note.id, pinned: !note.pinned })}
                aria-label={note.pinned ? 'Unpin' : 'Pin'}
                className={cn(
                  'rounded p-1 hover:bg-muted hover:text-foreground',
                  note.pinned && 'text-[color:var(--accent)]',
                )}
              >
                <Pin className="size-3.5" />
              </button>
              <button
                onClick={() => del.mutate(note.id)}
                aria-label="Delete note"
                className="rounded p-1 hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => dismiss.mutate(note.id)}
              aria-label="Got it — clear from my board"
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted hover:text-foreground"
            >
              <Check className="size-3.5" /> Got it
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

/** Compose dialog: body + audience (household / a member) + optional pin. The
 *  wall-tablet account can only post household notes, so it never sees the member
 *  picker. */
function ComposeNoteModal({ onClose }: { onClose: () => void }) {
  const { data: user } = useCurrentUser()
  const current = user as PublicUser | null
  const isTablet = current?.role === 'TABLET'
  const { data: members } = useMembers()
  const create = useCreateNote()

  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<NoteAudience>('HOUSEHOLD')
  const [recipientId, setRecipientId] = useState('')
  const [pinned, setPinned] = useState(false)

  const recipients = (members ?? []).filter((m) => m.id !== current?.id)
  const canSubmit =
    body.trim().length > 0 &&
    body.length <= NOTE_MAX_LENGTH &&
    (audience === 'HOUSEHOLD' || recipientId !== '') &&
    !create.isPending

  function submit() {
    const input: CreateNoteInput = {
      body: body.trim(),
      audience,
      pinned,
      ...(audience === 'DIRECT' ? { recipientId } : {}),
    }
    create.mutate(input, { onSuccess: onClose })
  }

  return (
    <Modal open onClose={onClose} title="New note" className="max-w-md">
      <div className="flex flex-col gap-4">
        <div>
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={NOTE_MAX_LENGTH}
            rows={3}
            placeholder="Milk’s off — don’t use it…"
            className="w-full resize-none rounded-control border border-input bg-surface p-3 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {body.length}/{NOTE_MAX_LENGTH}
          </p>
        </div>

        {!isTablet && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <AudienceButton
                active={audience === 'HOUSEHOLD'}
                onClick={() => setAudience('HOUSEHOLD')}
                label="Whole household"
              />
              <AudienceButton
                active={audience === 'DIRECT'}
                onClick={() => setAudience('DIRECT')}
                label="One person"
              />
            </div>
            {audience === 'DIRECT' && (
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="h-10 rounded-control border border-input bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Choose who it’s for…</option>
                {recipients.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin it (keeps it up — never expires)
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {create.isPending ? 'Posting…' : 'Post note'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AudienceButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-9 flex-1 rounded-control border px-3 text-sm',
        active
          ? 'border-accent bg-accent/10 text-ink'
          : 'border-input text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
}
