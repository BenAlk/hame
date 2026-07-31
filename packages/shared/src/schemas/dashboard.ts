import { z } from 'zod'

/**
 * Per-owner dashboard layouts (spec §8.12, §10 Phase 7.1). A "dashboard owner"
 * is either a User (their personal dashboard) or the shared household/tablet
 * (the wall tablet, spec §8.14). Each owner stores a react-grid-layout config
 * plus the ordered set of enabled widgets; an owner with no saved row falls back
 * to {@link DEFAULT_DASHBOARD}, so a fresh clone and a new user both look right
 * with zero setup.
 */

/** Every widget the dashboard can place. */
export const WIDGET_TYPES = [
  'clockGreeting',
  'quickNotes',
  'weather',
  'todaysMeals',
  'activeShopping',
  'todaysChores',
  'nextBinDay',
  'upcomingEvents',
  'petReminders',
  'expiringSoon',
  'lowStock',
  'smartHome',
  'heating',
  'wifiQr',
  'choreStats',
  'integrationStatus',
] as const
export type WidgetType = (typeof WIDGET_TYPES)[number]
export const WidgetTypeSchema = z.enum(WIDGET_TYPES)

/**
 * Responsive grid breakpoints (design §9): three columns on a landscape
 * tablet/desktop, two on a portrait tablet, reflowing to a single column on the
 * phone. `GRID_BREAKPOINTS` maps each name to its min width and `GRID_COLS` to
 * its column count — both feed react-grid-layout's `ResponsiveGridLayout`
 * directly.
 *
 * These widths are the *grid container* width (what react-grid-layout measures),
 * not the viewport — the container is the viewport minus the ~64px icon rail and
 * the page gutters, so the thresholds sit below the matching device widths:
 * `lg` (880) so a ≥1024-viewport landscape tablet/desktop still lands on 3
 * columns, `md` (512) so a portrait tablet (~768–900 viewport) gets 2 rather
 * than dropping to the phone's single column — the original 1024 cutoff was a
 * *desktop* width, so a portrait tablet wrongly counted as a phone. The paired
 * nav-rail cutoff lives in `app-shell.tsx` (Tailwind `sm`, viewport-based).
 */
export const GRID_BREAKPOINTS = { lg: 880, md: 512, xs: 0 } as const
export const GRID_COLS = { lg: 3, md: 2, xs: 1 } as const
export type Breakpoint = keyof typeof GRID_COLS

/** Catalogue metadata per widget: label, default + minimum grid size, and
 *  whether it needs a live Home Assistant connection to show anything. */
export interface WidgetMeta {
  label: string
  defaultW: number
  defaultH: number
  minW: number
  minH: number
  /** HA-gated widgets are only offered when HA exposes entities (spec §8.11). */
  requiresHa: boolean
}

export const DASHBOARD_WIDGETS: Record<WidgetType, WidgetMeta> = {
  clockGreeting: {
    label: 'Clock & greeting',
    defaultW: 1,
    defaultH: 2,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  quickNotes: {
    label: 'QuickNotes',
    defaultW: 1,
    defaultH: 3,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  weather: { label: 'Weather', defaultW: 1, defaultH: 2, minW: 1, minH: 2, requiresHa: true },
  todaysMeals: {
    label: "Today's meals",
    defaultW: 1,
    defaultH: 2,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  activeShopping: {
    label: 'Active shopping list',
    defaultW: 1,
    defaultH: 3,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  todaysChores: {
    label: "Today's chores",
    defaultW: 1,
    defaultH: 3,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  nextBinDay: {
    label: 'Next bin day',
    defaultW: 1,
    defaultH: 2,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  upcomingEvents: {
    label: 'Upcoming events',
    defaultW: 1,
    defaultH: 3,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  petReminders: {
    label: 'Pet reminders',
    defaultW: 1,
    defaultH: 2,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  expiringSoon: {
    label: 'Expiring soon',
    defaultW: 1,
    defaultH: 2,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  lowStock: { label: 'Low stock', defaultW: 1, defaultH: 3, minW: 1, minH: 2, requiresHa: false },
  smartHome: { label: 'Smart home', defaultW: 1, defaultH: 2, minW: 1, minH: 2, requiresHa: true },
  heating: { label: 'Heating', defaultW: 1, defaultH: 2, minW: 1, minH: 2, requiresHa: true },
  wifiQr: { label: 'WiFi QR code', defaultW: 1, defaultH: 3, minW: 1, minH: 3, requiresHa: false },
  choreStats: {
    label: 'Chore stats',
    defaultW: 1,
    defaultH: 2,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
  integrationStatus: {
    label: 'System status',
    defaultW: 1,
    defaultH: 3,
    minW: 1,
    minH: 2,
    requiresHa: false,
  },
}

/** The default placement order — clock first, then reading order of the grid. */
export const DEFAULT_WIDGET_ORDER: WidgetType[] = [
  'clockGreeting',
  'quickNotes',
  'weather',
  'todaysMeals',
  'activeShopping',
  'todaysChores',
  'nextBinDay',
  'upcomingEvents',
  'petReminders',
  'expiringSoon',
  'lowStock',
  'smartHome',
  'heating',
  'wifiQr',
  'choreStats',
  'integrationStatus',
]

/** One positioned tile in a react-grid-layout (`i` keys it to a widget id). */
export const GridItemSchema = z.object({
  i: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  minW: z.number().int().min(1).optional(),
  minH: z.number().int().min(1).optional(),
})
export type GridItem = z.infer<typeof GridItemSchema>

/** An enabled widget on a dashboard. `id` is unique per dashboard and matches a
 *  layout tile's `i`; `type` selects the component; `config` is widget-specific. */
export const DashboardWidgetSchema = z.object({
  id: z.string().min(1),
  type: WidgetTypeSchema,
  config: z.record(z.string(), z.unknown()).optional(),
})
export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>

/** A complete dashboard: layout tiles per breakpoint + the ordered widget set.
 *  Refined so every widget id is unique and has a tile in each stored
 *  breakpoint (and vice versa), keeping the grid and widget set consistent. */
export const DashboardLayoutSchema = z
  .object({
    layout: z.record(z.string(), z.array(GridItemSchema)),
    widgets: z.array(DashboardWidgetSchema),
  })
  .superRefine((value, ctx) => {
    const ids = value.widgets.map((w) => w.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Widget ids must be unique', path: ['widgets'] })
    }
    const idSet = new Set(ids)
    for (const [breakpoint, items] of Object.entries(value.layout)) {
      for (const item of items) {
        if (!idSet.has(item.i)) {
          ctx.addIssue({
            code: 'custom',
            message: `Layout tile "${item.i}" has no matching widget`,
            path: ['layout', breakpoint],
          })
        }
      }
    }
  })
export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>

/** Save shape for PUT /api/dashboard — same as the read shape. */
export const UpdateDashboardLayoutSchema = DashboardLayoutSchema
export type UpdateDashboardLayoutInput = z.infer<typeof UpdateDashboardLayoutSchema>

/**
 * Pack the given widgets left-to-right, top-to-bottom into `cols` columns using
 * each widget's default height (a per-column skyline), yielding non-overlapping
 * tiles. Pure and deterministic, so the default template is reproducible.
 */
function packLayout(order: WidgetType[], cols: number): GridItem[] {
  const colHeights = new Array<number>(cols).fill(0)
  return order.map((type) => {
    const meta = DASHBOARD_WIDGETS[type]
    // Shortest column wins, ties broken left-to-right (keeps reading order).
    let col = 0
    for (let c = 1; c < cols; c++) if (colHeights[c] < colHeights[col]) col = c
    const item: GridItem = {
      i: type,
      x: col,
      y: colHeights[col],
      w: 1,
      h: meta.defaultH,
      minW: meta.minW,
      minH: meta.minH,
    }
    colHeights[col] += meta.defaultH
    return item
  })
}

/** Build a default dashboard for the given widget order, laid out per breakpoint. */
export function buildDefaultDashboard(order: WidgetType[] = DEFAULT_WIDGET_ORDER): DashboardLayout {
  const layout: Record<string, GridItem[]> = {}
  for (const [name, cols] of Object.entries(GRID_COLS)) {
    layout[name] = packLayout(order, cols)
  }
  return {
    layout,
    widgets: order.map((type) => ({ id: type, type })),
  }
}

/** The zero-setup default every un-customised owner (and a fresh clone) sees. */
export const DEFAULT_DASHBOARD: DashboardLayout = buildDefaultDashboard()
