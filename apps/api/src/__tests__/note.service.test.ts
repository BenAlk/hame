import { describe, it, expect, vi, beforeEach } from 'vitest'

const note = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
}
const noteAck = { createMany: vi.fn(), upsert: vi.fn() }
const user = { findUnique: vi.fn(), findMany: vi.fn() }
const notificationPreference = { findMany: vi.fn() }

vi.mock('../lib/prisma.js', () => ({ prisma: { note, noteAck, user, notificationPreference } }))
// The direct-note push is fire-and-forget; stub the HA path to a no-op so tests
// exercise the note logic, not the transport.
vi.mock('../services/home-assistant-config.service.js', () => ({
  getConnectionSettings: vi.fn().mockResolvedValue(null),
}))
vi.mock('../integrations/home-assistant/notifications.js', () => ({
  sendHaNotification: vi.fn(),
}))

const { listNotesForViewer, createNote, dismissNote, sweepExpiredNotes } =
  await import('../services/note.service.js')

const member = (id: string, firstName = 'Alex') => ({ id, firstName, colour: '#3B82F6' })
/** A recipient join row as Prisma returns it with the service's include. */
const recipientRow = (id: string, firstName = 'Sam') => ({
  userId: id,
  user: member(id, firstName),
})

/** A stored note row as Prisma would return it with the service's include. */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n1',
    authorId: 'author',
    body: 'hello',
    audience: 'HOUSEHOLD',
    recipients: [],
    colour: null,
    pinned: false,
    expiresAt: null,
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-01'),
    author: member('author'),
    acks: [],
    ...over,
  }
}

beforeEach(() => {
  for (const fn of [
    note.findMany,
    note.findUnique,
    note.create,
    note.update,
    note.delete,
    note.deleteMany,
    noteAck.createMany,
    noteAck.upsert,
    user.findUnique,
    user.findMany,
    notificationPreference.findMany,
  ])
    fn.mockReset()
  noteAck.createMany.mockResolvedValue({ count: 0 })
  notificationPreference.findMany.mockResolvedValue([])
})

describe('listNotesForViewer', () => {
  it('scopes the query to household notes plus the viewer’s own direct notes', async () => {
    note.findMany.mockResolvedValue([])
    await listNotesForViewer('me')
    const where = note.findMany.mock.calls[0][0].where
    const branches = where.AND[1].OR
    expect(branches).toEqual([
      { audience: 'HOUSEHOLD' },
      { audience: 'DIRECT', recipients: { some: { userId: 'me' } } },
      { audience: 'DIRECT', authorId: 'me' },
    ])
    // Unexpired filter is present (null expiry or in the future).
    expect(where.AND[0].OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }])
  })

  it('drops household notes the viewer has dismissed from their board', async () => {
    note.findMany.mockResolvedValue([
      row({ id: 'kept' }),
      row({ id: 'gone', acks: [{ userId: 'me', dismissed: true, seenAt: new Date() }] }),
    ])
    const notes = await listNotesForViewer('me')
    expect(notes.map((n) => n.id)).toEqual(['kept'])
  })

  it('marks a direct note to the viewer as seen on first view', async () => {
    note.findMany.mockResolvedValue([
      row({
        id: 'd1',
        audience: 'DIRECT',
        authorId: 'author',
        recipients: [recipientRow('me', 'Me')],
        acks: [],
      }),
    ])
    await listNotesForViewer('me')
    expect(noteAck.createMany).toHaveBeenCalledWith({
      data: [{ noteId: 'd1', userId: 'me', seenAt: expect.any(Date) }],
      skipDuplicates: true,
    })
  })

  it('surfaces each recipient’s seen time to the note’s author', async () => {
    const seenAt = new Date('2026-07-02')
    note.findMany.mockResolvedValue([
      row({
        id: 'd1',
        audience: 'DIRECT',
        authorId: 'me',
        recipients: [recipientRow('them', 'Sam'), recipientRow('other', 'Ada')],
        acks: [{ userId: 'them', dismissed: false, seenAt }],
      }),
    ])
    const [n] = await listNotesForViewer('me')
    expect(n.mine).toBe(true)
    expect(n.recipients.find((r) => r.id === 'them')?.seenAt).toEqual(seenAt)
    // The recipient who hasn't looked yet has no read receipt.
    expect(n.recipients.find((r) => r.id === 'other')?.seenAt).toBeNull()
  })
})

describe('createNote', () => {
  it('refuses a direct note from the shared tablet account', async () => {
    await expect(
      createNote(
        { body: 'hi', audience: 'DIRECT', recipientIds: ['sam'] },
        { id: 'tablet', role: 'TABLET' },
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects a direct note whose recipient isn’t a household member', async () => {
    user.findMany.mockResolvedValue([]) // none of the ids resolve to a person
    await expect(
      createNote(
        { body: 'hi', audience: 'DIRECT', recipientIds: ['ghost'] },
        { id: 'author', role: 'MEMBER' },
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('creates a join row per recipient, deduped and excluding the author', async () => {
    user.findMany.mockResolvedValue([member('sam'), member('ada')])
    note.create.mockResolvedValue(row())
    await createNote(
      { body: 'psst', audience: 'DIRECT', recipientIds: ['sam', 'ada', 'sam', 'author'] },
      { id: 'author', role: 'MEMBER' },
    )
    const data = note.create.mock.calls[0][0].data
    expect(data.recipients.create).toEqual([{ userId: 'sam' }, { userId: 'ada' }])
  })

  it('gives a non-pinned note a +7 day expiry', async () => {
    note.create.mockResolvedValue(row())
    await createNote({ body: 'milk', audience: 'HOUSEHOLD' }, { id: 'author', role: 'MEMBER' })
    const data = note.create.mock.calls[0][0].data
    const days = (data.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)
  })

  it('leaves a pinned note with no expiry', async () => {
    note.create.mockResolvedValue(row({ pinned: true }))
    await createNote(
      { body: 'keep me', audience: 'HOUSEHOLD', pinned: true },
      { id: 'author', role: 'MEMBER' },
    )
    expect(note.create.mock.calls[0][0].data.expiresAt).toBeNull()
  })
})

describe('dismissNote', () => {
  it('upserts a dismissed ack for the viewer', async () => {
    note.findUnique.mockResolvedValue({
      id: 'n1',
      audience: 'HOUSEHOLD',
      recipients: [],
      authorId: 'x',
    })
    await dismissNote('n1', 'me')
    expect(noteAck.upsert).toHaveBeenCalledWith({
      where: { noteId_userId: { noteId: 'n1', userId: 'me' } },
      update: { dismissed: true },
      create: { noteId: 'n1', userId: 'me', dismissed: true },
    })
  })
})

describe('sweepExpiredNotes', () => {
  it('hard-deletes every past-expiry note', async () => {
    note.deleteMany.mockResolvedValue({ count: 3 })
    const removed = await sweepExpiredNotes(new Date('2026-07-10'))
    expect(note.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date('2026-07-10') } },
    })
    expect(removed).toBe(3)
  })
})
