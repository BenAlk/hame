import { describe, it, expect } from 'vitest'
import { CreateNoteSchema, UpdateNoteSchema, NOTE_MAX_LENGTH } from '@hame/shared'

/** Pure validation of the QuickNotes contract (spec §8.16) — the compose form and
 *  the API share these, so the audience/recipient rules are asserted once here. */
describe('CreateNoteSchema', () => {
  it('defaults audience to HOUSEHOLD and needs no recipient', () => {
    const parsed = CreateNoteSchema.parse({ body: 'Bins out tonight' })
    expect(parsed.audience).toBe('HOUSEHOLD')
  })

  it('rejects a DIRECT note with no recipients', () => {
    expect(CreateNoteSchema.safeParse({ body: 'psst', audience: 'DIRECT' }).success).toBe(false)
    expect(
      CreateNoteSchema.safeParse({ body: 'psst', audience: 'DIRECT', recipientIds: [] }).success,
    ).toBe(false)
  })

  it('accepts a DIRECT note addressed to one or more members', () => {
    const result = CreateNoteSchema.safeParse({
      body: 'your parcel is behind the sofa',
      audience: 'DIRECT',
      recipientIds: [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a HOUSEHOLD note that carries recipients', () => {
    const result = CreateNoteSchema.safeParse({
      body: 'for the whole house',
      audience: 'HOUSEHOLD',
      recipientIds: ['11111111-1111-1111-1111-111111111111'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty or whitespace-only body', () => {
    expect(CreateNoteSchema.safeParse({ body: '   ' }).success).toBe(false)
  })

  it('rejects a body over the length cap', () => {
    expect(CreateNoteSchema.safeParse({ body: 'x'.repeat(NOTE_MAX_LENGTH + 1) }).success).toBe(
      false,
    )
  })
})

describe('UpdateNoteSchema', () => {
  it('requires at least one field', () => {
    expect(UpdateNoteSchema.safeParse({}).success).toBe(false)
  })

  it('accepts a lone pin toggle', () => {
    expect(UpdateNoteSchema.safeParse({ pinned: true }).success).toBe(true)
  })
})
