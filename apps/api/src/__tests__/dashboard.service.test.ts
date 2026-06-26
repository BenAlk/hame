import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_DASHBOARD } from '@hame/shared'

const findUnique = vi.fn()
const upsert = vi.fn()

vi.mock('../lib/prisma.js', () => ({
  prisma: { dashboardLayout: { findUnique, upsert } },
}))

const { getDashboardLayout, saveDashboardLayout, HOUSEHOLD_ID } =
  await import('../services/dashboard.service.js')

function savedRow() {
  return { layout: DEFAULT_DASHBOARD.layout, widgets: DEFAULT_DASHBOARD.widgets }
}

beforeEach(() => {
  findUnique.mockReset()
  upsert.mockReset()
})

describe('getDashboardLayout', () => {
  it('falls back to the shared default when the owner has no saved row', async () => {
    findUnique.mockResolvedValue(null)
    const layout = await getDashboardLayout({ kind: 'user', userId: 'u1' })
    expect(layout).toEqual(DEFAULT_DASHBOARD)
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } })
  })

  it('reads the household row by its fixed id', async () => {
    findUnique.mockResolvedValue(savedRow())
    await getDashboardLayout({ kind: 'household' })
    expect(findUnique).toHaveBeenCalledWith({ where: { id: HOUSEHOLD_ID } })
  })

  it('re-validates a stored row before returning it', async () => {
    findUnique.mockResolvedValue({ layout: { lg: 'not-an-array' }, widgets: [] })
    await expect(getDashboardLayout({ kind: 'user', userId: 'u1' })).rejects.toThrow()
  })
})

describe('saveDashboardLayout', () => {
  it('upserts a personal layout keyed by userId', async () => {
    upsert.mockResolvedValue(savedRow())
    await saveDashboardLayout({ kind: 'user', userId: 'u1' }, DEFAULT_DASHBOARD)
    const call = upsert.mock.calls[0][0]
    expect(call.where).toEqual({ userId: 'u1' })
    expect(call.create).toMatchObject({ userId: 'u1' })
    expect(call.create).not.toHaveProperty('isHousehold')
  })

  it('upserts the household layout as the fixed shared row', async () => {
    upsert.mockResolvedValue(savedRow())
    await saveDashboardLayout({ kind: 'household' }, DEFAULT_DASHBOARD)
    const call = upsert.mock.calls[0][0]
    expect(call.where).toEqual({ id: HOUSEHOLD_ID })
    expect(call.create).toMatchObject({ id: HOUSEHOLD_ID, isHousehold: true })
  })

  it('round-trips the saved layout back through validation', async () => {
    upsert.mockResolvedValue(savedRow())
    const result = await saveDashboardLayout({ kind: 'user', userId: 'u1' }, DEFAULT_DASHBOARD)
    expect(result).toEqual(DEFAULT_DASHBOARD)
  })
})
