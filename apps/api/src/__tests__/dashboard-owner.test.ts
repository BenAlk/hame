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

  it('rejects an unknown owner value with 400', () => {
    expect(() => resolveOwner(req({ owner: 'someone-else', userId: 'u1' }))).toThrow(HttpError)
    try {
      resolveOwner(req({ owner: 'someone-else', userId: 'u1' }))
    } catch (err) {
      expect((err as HttpError).status).toBe(400)
    }
  })

  it('rejects a user owner with no authenticated user (401)', () => {
    try {
      resolveOwner(req({ owner: 'me' }))
      throw new Error('expected resolveOwner to throw')
    } catch (err) {
      expect((err as HttpError).status).toBe(401)
    }
  })
})
