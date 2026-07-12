import { describe, it, expect } from 'vitest'
import type { Request } from 'express'
import { HttpError } from '../lib/http-error.js'
import { HOUSEHOLD_ID, resolveOwner, whereForOwner } from '../lib/dashboard-owner.js'

/** Minimal Request stand-in: just the bits resolveOwner reads. */
function req(over: { owner?: unknown; userId?: string } = {}): Request {
  return {
    query: over.owner === undefined ? {} : { owner: over.owner },
    user: over.userId ? { id: over.userId } : undefined,
  } as unknown as Request
}

describe('whereForOwner', () => {
  it('keys the household row by the shared fixed id', () => {
    expect(whereForOwner({ kind: 'household' })).toEqual({ id: HOUSEHOLD_ID })
  })

  it('keys a user row by its unique userId', () => {
    expect(whereForOwner({ kind: 'user', userId: 'u1' })).toEqual({ userId: 'u1' })
  })
})

describe('resolveOwner', () => {
  it('resolves ?owner=household to the household owner', () => {
    expect(resolveOwner(req({ owner: 'household' }))).toEqual({ kind: 'household' })
  })

  it('resolves ?owner=me to the signed-in user', () => {
    expect(resolveOwner(req({ owner: 'me', userId: 'u1' }))).toEqual({
      kind: 'user',
      userId: 'u1',
    })
  })

  it('defaults to the signed-in user when owner is omitted', () => {
    expect(resolveOwner(req({ userId: 'u1' }))).toEqual({ kind: 'user', userId: 'u1' })
  })

  it('rejects a non-string owner (e.g. repeated param) with 400', () => {
    expectStatus(() => resolveOwner(req({ owner: ['a', 'b'], userId: 'u1' })), 400)
  })

  it('rejects a user owner with no authenticated user (401)', () => {
    expectStatus(() => resolveOwner(req({ owner: 'me' })), 401)
  })

  // ── Write path (default): only self or household may be written ──────────────
  const otherId = '11111111-1111-4111-8111-111111111111'

  it('lets a user write their own row by explicit id', () => {
    expect(resolveOwner(req({ owner: otherId, userId: otherId }))).toEqual({
      kind: 'user',
      userId: otherId,
    })
  })

  it('refuses to write another user’s row with 403', () => {
    expectStatus(() => resolveOwner(req({ owner: otherId, userId: 'u1' })), 403)
  })

  // ── Read path (allowOtherUser): any member’s row is viewable ─────────────────
  it('resolves any valid user id for a read', () => {
    expect(resolveOwner(req({ owner: otherId, userId: 'u1' }), { allowOtherUser: true })).toEqual({
      kind: 'user',
      userId: otherId,
    })
  })

  it('still rejects a malformed (non-uuid) id on a read with 400', () => {
    expectStatus(
      () => resolveOwner(req({ owner: 'not-a-uuid', userId: 'u1' }), { allowOtherUser: true }),
      400,
    )
  })

  it('still resolves household on a read', () => {
    expect(resolveOwner(req({ owner: 'household' }), { allowOtherUser: true })).toEqual({
      kind: 'household',
    })
  })
})

/** Assert the thunk throws an HttpError with the given status. */
function expectStatus(fn: () => unknown, status: number): void {
  try {
    fn()
    throw new Error('expected resolveOwner to throw')
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(status)
  }
}
