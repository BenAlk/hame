import type { Prisma } from '@prisma/client'
import {
  NOTE_DEFAULT_TTL_DAYS,
  PERSON_ROLES,
  type CreateNoteInput,
  type Note,
  type UpdateNoteInput,
} from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { HttpError } from '../lib/http-error.js'
import { toMemberSummary } from './user.service.js'
import { getConnectionSettings } from './home-assistant-config.service.js'
import { sendHaNotification } from '../integrations/home-assistant/notifications.js'

/**
 * QuickNotes (spec §8.16, §10 Phase 11) — the household "fridge board". Household
 * notes show on every dashboard; a direct note is private to its recipients. The
 * privacy invariant (§8.16) is enforced here as a **query**: the viewer feed only
 * ever unions household notes with the caller's own direct notes, so the shared
 * tablet (which requests as the TABLET account, never a note's author/recipient)
 * structurally cannot surface a member's private note.
 */

const memberSelect = { id: true, firstName: true, colour: true } as const

const noteInclude = {
  author: { select: memberSelect },
  recipients: { include: { user: { select: memberSelect } } },
  acks: true,
} as const satisfies Prisma.NoteInclude

type NoteRow = Prisma.NoteGetPayload<{ include: typeof noteInclude }>

/** Shape a row for a specific viewer, computing the viewer-relative flags. */
function toNote(row: NoteRow, viewerId: string): Note {
  const mine = row.authorId === viewerId
  const myAck = row.acks.find((a) => a.userId === viewerId)
  // Read receipts are shown only to the author — each recipient's first view.
  const recipients = row.recipients.map((r) => ({
    ...toMemberSummary(r.user),
    seenAt: mine ? (row.acks.find((a) => a.userId === r.userId)?.seenAt ?? null) : null,
  }))
  return {
    id: row.id,
    body: row.body,
    audience: row.audience,
    author: toMemberSummary(row.author),
    recipients,
    colour: row.colour,
    pinned: row.pinned,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    mine,
    dismissed: myAck?.dismissed ?? false,
  }
}

/** Notes still live at `now` — either no expiry (pinned/kept) or not yet past. */
function unexpiredWhere(now: Date): Prisma.NoteWhereInput {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
}

/**
 * The viewer-scoped feed: unexpired household notes plus the caller's own direct
 * notes (as recipient or author), pinned first then newest. Household notes the
 * viewer has dismissed are dropped from their board (they remain for everyone
 * else). Viewing also records a "seen" ack for a direct note addressed to the
 * caller, so its author gets a read receipt without a separate client call.
 */
export async function listNotesForViewer(
  viewerId: string,
  now: Date = new Date(),
): Promise<Note[]> {
  const rows = await prisma.note.findMany({
    where: {
      AND: [
        unexpiredWhere(now),
        {
          OR: [
            { audience: 'HOUSEHOLD' },
            { audience: 'DIRECT', recipients: { some: { userId: viewerId } } },
            { audience: 'DIRECT', authorId: viewerId },
          ],
        },
      ],
    },
    include: noteInclude,
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  })

  // Mark direct-to-me notes seen (first view only — an existing ack is untouched),
  // powering the sender's "seen" indicator. Fire-and-forget on the read path.
  const toMarkSeen = rows.filter(
    (r) =>
      r.audience === 'DIRECT' &&
      r.recipients.some((rec) => rec.userId === viewerId) &&
      !r.acks.some((a) => a.userId === viewerId),
  )
  if (toMarkSeen.length > 0) {
    await prisma.noteAck.createMany({
      data: toMarkSeen.map((r) => ({ noteId: r.id, userId: viewerId, seenAt: now })),
      skipDuplicates: true,
    })
  }

  // Drop household notes the viewer has dismissed from their own board.
  return rows
    .filter((r) => !r.acks.some((a) => a.userId === viewerId && a.dismissed))
    .map((r) => toNote(r, viewerId))
}

/** Expiry `now + TTL` for a non-pinned note; pinned notes never expire (null). */
function expiryFor(pinned: boolean, now: Date): Date | null {
  if (pinned) return null
  const at = new Date(now)
  at.setDate(at.getDate() + NOTE_DEFAULT_TTL_DAYS)
  return at
}

interface Author {
  id: string
  role: string
}

export async function createNote(input: CreateNoteInput, author: Author): Promise<Note> {
  const pinned = input.pinned ?? false
  let recipientIds: string[] = []

  if (input.audience === 'DIRECT') {
    // The shared tablet isn't a household person, so it can only post to the board.
    if (!(PERSON_ROLES as readonly string[]).includes(author.role)) {
      throw HttpError.forbidden('The wall tablet can only post household notes')
    }
    // Dedupe, and don't let the author address the note to themselves.
    recipientIds = [...new Set(input.recipientIds ?? [])].filter((id) => id !== author.id)
    if (recipientIds.length === 0) {
      throw HttpError.badRequest('Choose a household member to send it to')
    }
    const members = await prisma.user.findMany({
      where: { id: { in: recipientIds }, role: { in: [...PERSON_ROLES] } },
      select: { id: true },
    })
    if (members.length !== recipientIds.length) {
      throw HttpError.badRequest('Choose a household member to send it to')
    }
  }

  const now = new Date()
  const row = await prisma.note.create({
    data: {
      authorId: author.id,
      body: input.body,
      audience: input.audience,
      colour: input.colour ?? null,
      pinned,
      expiresAt: expiryFor(pinned, now),
      ...(recipientIds.length > 0 && {
        recipients: { create: recipientIds.map((userId) => ({ userId })) },
      }),
    },
    include: noteInclude,
  })

  // A direct note pings each recipient's phone (best-effort; never blocks the post).
  if (row.audience === 'DIRECT') {
    void notifyDirectNote(row).catch((err) =>
      logger.warn({ err, noteId: row.id }, 'Direct-note push failed'),
    )
  }

  return toNote(row, author.id)
}

export async function updateNote(
  id: string,
  input: UpdateNoteInput,
  viewer: Author,
): Promise<Note> {
  const existing = await prisma.note.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Note not found')
  if (existing.authorId !== viewer.id) throw HttpError.forbidden('Only the author can edit a note')

  // Re-derive expiry when the pin changes; keep the stored value otherwise so an
  // edit doesn't silently extend (or shorten) a note's life.
  const pinned = input.pinned ?? existing.pinned
  const expiresAt =
    input.pinned !== undefined && input.pinned !== existing.pinned
      ? expiryFor(pinned, existing.createdAt)
      : existing.expiresAt

  const row = await prisma.note.update({
    where: { id },
    data: {
      ...(input.body !== undefined && { body: input.body }),
      ...(input.colour !== undefined && { colour: input.colour }),
      ...(input.pinned !== undefined && { pinned, expiresAt }),
    },
    include: noteInclude,
  })
  return toNote(row, viewer.id)
}

export async function deleteNote(id: string, viewer: Author): Promise<void> {
  const existing = await prisma.note.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Note not found')
  // The author removes it for everyone; an admin can tidy the shared board too.
  if (existing.authorId !== viewer.id && viewer.role !== 'ADMIN') {
    throw HttpError.forbidden('Only the author can delete a note')
  }
  await prisma.note.delete({ where: { id } })
}

/**
 * "Got it" — clear a note from the viewer's own board. For a household note this
 * hides it for that user only (an ack row) and leaves it up for everyone else; a
 * direct note addressed to the viewer is likewise cleared from their board. The
 * note itself is untouched, so the author's copy and its expiry are unaffected.
 */
export async function dismissNote(id: string, viewerId: string): Promise<void> {
  const note = await prisma.note.findUnique({
    where: { id },
    include: { recipients: { select: { userId: true } } },
  })
  if (!note) throw HttpError.notFound('Note not found')
  // You can only dismiss a note that's actually on your board.
  const onMyBoard =
    note.audience === 'HOUSEHOLD' ||
    note.authorId === viewerId ||
    note.recipients.some((r) => r.userId === viewerId)
  if (!onMyBoard) throw HttpError.forbidden('That note is not on your board')

  await prisma.noteAck.upsert({
    where: { noteId_userId: { noteId: id, userId: viewerId } },
    update: { dismissed: true },
    create: { noteId: id, userId: viewerId, dismissed: true },
  })
}

/** Hard-delete every past-expiry note. Called nightly by the sweep job; returns the
 *  number removed. Pinned/kept notes have a null expiry, so they're never swept. */
export async function sweepExpiredNotes(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.note.deleteMany({ where: { expiresAt: { lt: now } } })
  if (count > 0) logger.info({ count }, 'Swept expired QuickNotes')
  return count
}

/** Best-effort phone push for a new direct note, gated on each recipient's prefs. */
async function notifyDirectNote(row: NoteRow): Promise<void> {
  if (row.recipients.length === 0) return

  const settings = await getConnectionSettings()
  if (!settings) return

  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: { in: row.recipients.map((r) => r.userId) } },
  })

  await Promise.all(
    prefs.map((p) => {
      if (!p.pushViaHA || !p.haNotifyService || !p.directNoteAlerts) return undefined
      return sendHaNotification(settings.url, settings.token, p.haNotifyService, {
        title: `Note from ${row.author.firstName}`,
        message: row.body,
      })
    }),
  )
}
