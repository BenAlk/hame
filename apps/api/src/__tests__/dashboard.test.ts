import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD,
  DashboardLayoutSchema,
  GRID_COLS,
  WIDGET_TYPES,
  buildDefaultDashboard,
} from '@hame/shared'

describe('DEFAULT_DASHBOARD template', () => {
  it('is a structurally valid dashboard', () => {
    expect(DashboardLayoutSchema.safeParse(DEFAULT_DASHBOARD).success).toBe(true)
  })

  it('places every known widget exactly once', () => {
    const types = DEFAULT_DASHBOARD.widgets.map((w) => w.type)
    expect(new Set(types)).toEqual(new Set(WIDGET_TYPES))
    expect(types).toHaveLength(WIDGET_TYPES.length)
  })

  it('has a matching tile for every widget in every breakpoint, within its column count', () => {
    const ids = new Set(DEFAULT_DASHBOARD.widgets.map((w) => w.id))
    for (const [breakpoint, cols] of Object.entries(GRID_COLS)) {
      const tiles = DEFAULT_DASHBOARD.layout[breakpoint]
      expect(tiles).toBeDefined()
      expect(new Set(tiles.map((t) => t.i))).toEqual(ids)
      for (const tile of tiles) {
        expect(tile.x).toBeGreaterThanOrEqual(0)
        expect(tile.x + tile.w).toBeLessThanOrEqual(cols)
        expect(tile.h).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('honours each widget catalogue entry (label + sizes)', () => {
    for (const type of WIDGET_TYPES) {
      const meta = DASHBOARD_WIDGETS[type]
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.defaultH).toBeGreaterThanOrEqual(meta.minH)
      expect(meta.defaultW).toBeGreaterThanOrEqual(meta.minW)
    }
  })

  it('stacks into a single column on the phone breakpoint', () => {
    const xs = buildDefaultDashboard().layout.xs
    expect(xs.every((t) => t.x === 0 && t.w === 1)).toBe(true)
    // No two tiles overlap vertically (each starts where the last ends).
    const sorted = [...xs].sort((a, b) => a.y - b.y)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].y).toBeGreaterThanOrEqual(sorted[i - 1].y + sorted[i - 1].h)
    }
  })
})

describe('DashboardLayoutSchema', () => {
  const base = DEFAULT_DASHBOARD

  it('rejects duplicate widget ids', () => {
    const dup = {
      ...base,
      widgets: [base.widgets[0], { ...base.widgets[0] }],
    }
    expect(DashboardLayoutSchema.safeParse(dup).success).toBe(false)
  })

  it('rejects a layout tile with no matching widget', () => {
    const orphan = {
      widgets: [{ id: 'weather', type: 'weather' as const }],
      layout: { lg: [{ i: 'ghost', x: 0, y: 0, w: 1, h: 2 }] },
    }
    expect(DashboardLayoutSchema.safeParse(orphan).success).toBe(false)
  })

  it('accepts a minimal valid dashboard', () => {
    const ok = {
      widgets: [{ id: 'weather', type: 'weather' as const }],
      layout: { lg: [{ i: 'weather', x: 0, y: 0, w: 1, h: 2 }] },
    }
    expect(DashboardLayoutSchema.safeParse(ok).success).toBe(true)
  })
})
