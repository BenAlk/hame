import { useEffect, useState } from 'react'
import { Responsive, WidthProvider, type Layouts } from 'react-grid-layout'
import { Eye, Pencil, Plus, X } from 'lucide-react'
import type { DashboardLayout, GridItem, WidgetType } from '@hame/shared'
import { DASHBOARD_WIDGETS, GRID_BREAKPOINTS, GRID_COLS, WIDGET_TYPES } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { WIDGET_COMPONENTS, useWidgetAvailability } from '@/components/features/widgets/registry'
import { useDashboardOwner } from '@/components/features/dashboard/dashboard-owner'
import {
  isEditableOwner,
  useDashboardLayout,
  useSaveDashboardLayout,
  type DashboardOwner,
} from '@/api/dashboard'
import { useCurrentUser } from '@/api/auth'
import { useMembers } from '@/api/users'
import { cn } from '@/lib/utils'
// react-grid-layout's stylesheet bundles the react-resizable handle styles too,
// so this one import covers both drag and resize.
import 'react-grid-layout/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)
const ROW_HEIGHT = 88
const MARGIN: [number, number] = [16, 16]

/** Append a widget's tile to the bottom of every breakpoint's column. */
function addTiles(layout: DashboardLayout['layout'], type: WidgetType): DashboardLayout['layout'] {
  const meta = DASHBOARD_WIDGETS[type]
  const next: DashboardLayout['layout'] = {}
  for (const bp of Object.keys(GRID_COLS)) {
    const items = layout[bp] ?? []
    const bottom = items.reduce((m, it) => Math.max(m, it.y + it.h), 0)
    const tile: GridItem = {
      i: type,
      x: 0,
      y: bottom,
      w: 1,
      h: meta.defaultH,
      minW: meta.minW,
      minH: meta.minH,
    }
    next[bp] = [...items, tile]
  }
  return next
}

/** Drop a widget's tile from every breakpoint. */
function removeTiles(layout: DashboardLayout['layout'], id: string): DashboardLayout['layout'] {
  const next: DashboardLayout['layout'] = {}
  for (const [bp, items] of Object.entries(layout)) next[bp] = items.filter((it) => it.i !== id)
  return next
}

/**
 * The per-owner, drag-and-drop dashboard (spec §8.12, §10 Phase 7.1). Reads the
 * signed-in user's layout or the shared household/tablet one (a localStorage
 * toggle, so the wall tablet stays on Household across reloads). An "Edit layout"
 * mode turns on drag/resize, an add-widget tray and per-tile remove; Save writes
 * the layout back, Cancel discards. HA-gated widgets are only offered when HA is
 * live, and a placed-but-unavailable one shows a quiet placeholder, never a hole.
 */
export function DashboardGrid() {
  const { owner, setOwner } = useDashboardOwner()
  const { data: members } = useMembers()
  const { data: currentUser } = useCurrentUser()

  const { data, isPending } = useDashboardLayout(owner)
  const save = useSaveDashboardLayout(owner)
  const availability = useWidgetAvailability()

  // `draft` is non-null exactly while editing; otherwise we render the saved data.
  const [draft, setDraft] = useState<DashboardLayout | null>(null)
  const editing = draft !== null
  const view = draft ?? data

  // The signed-in person's own chip is represented as `me`; the wall-tablet
  // account isn't a person (not in the roster), so it has no personal board —
  // fall it back to the shared Household view instead of an empty "me" one.
  const isPerson = !!currentUser && !!members?.some((m) => m.id === currentUser.id)
  useEffect(() => {
    if (owner === 'me' && currentUser && members && !isPerson) setOwner('household')
  }, [owner, currentUser, members, isPerson, setOwner])

  // You can only edit your own board (`me`) or the shared household one; every
  // other member's dashboard is a read-only view from the switcher (spec §8.1).
  const canEdit = isEditableOwner(owner)
  const viewingName = members?.find((m) => m.id === owner)?.firstName

  // Leaving an owner while editing would orphan the draft — discard it on switch.
  function switchOwner(next: DashboardOwner) {
    setDraft(null)
    setOwner(next)
  }

  if (isPending || !view) {
    return <p className="text-muted-foreground">Loading dashboard…</p>
  }

  const placed = new Set(view.widgets.map((w) => w.id))
  const addable = WIDGET_TYPES.filter((t) => availability[t] && !placed.has(t))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-pill border border-line p-0.5 text-sm">
          <SwitcherChip
            label="Household"
            active={owner === 'household'}
            onClick={() => switchOwner('household')}
          />
          {members?.map((m) => {
            const self = m.id === currentUser?.id
            const chipOwner: DashboardOwner = self ? 'me' : m.id
            return (
              <SwitcherChip
                key={m.id}
                label={self ? 'My dashboard' : m.firstName}
                colour={m.colour}
                active={owner === chipOwner}
                onClick={() => switchOwner(chipOwner)}
              />
            )
          })}
        </div>

        {!canEdit ? (
          <span className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-sm text-muted-foreground">
            <Eye className="size-4" aria-hidden />
            Viewing {viewingName ? `${viewingName}’s dashboard` : 'dashboard'} · read-only
          </span>
        ) : editing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={async () => {
                await save.mutateAsync(draft)
                setDraft(null)
              }}
              className="rounded-control bg-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save layout'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDraft(structuredClone(view))}
            className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-sm text-ink hover:border-accent hover:text-accent"
          >
            <Pencil className="size-4" aria-hidden />
            Edit layout
          </button>
        )}
      </div>

      {editing && (
        <div className="rounded-card border border-dashed border-line p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Add a widget
          </p>
          {addable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every available widget is on the board.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {addable.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDraft((d) => d && addWidgetToDraft(d, type))}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent"
                >
                  <Plus className="size-3.5" aria-hidden />
                  {DASHBOARD_WIDGETS[type].label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ResponsiveGridLayout
        className={cn(editing && 'rounded-card bg-accent-soft/30')}
        layouts={view.layout as unknown as Layouts}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        margin={MARGIN}
        containerPadding={[0, 0]}
        isDraggable={editing}
        isResizable={editing}
        draggableCancel=".widget-remove"
        onLayoutChange={(_current, all) => {
          if (editing) setDraft((d) => (d ? { ...d, layout: all as DashboardLayout['layout'] } : d))
        }}
      >
        {view.widgets.map((widget) => (
          <div key={widget.id} className={cn('h-full', editing && 'cursor-move')}>
            {/* Stretch the widget's card to fill its grid tile so the dashboard
                reads as fixed cards, not content floating with a gap below. In
                edit mode the card is made non-interactive so dragging a tile
                can't trigger its links/toggles — the mousedown still bubbles to
                the grid item, and the remove button (a sibling) stays clickable. */}
            <div
              className={cn(
                'relative h-full [&>section]:h-full [&>section]:overflow-y-auto',
                editing && '[&>section]:pointer-events-none [&>section]:select-none',
              )}
            >
              {editing && (
                <button
                  type="button"
                  aria-label={`Remove ${DASHBOARD_WIDGETS[widget.type].label}`}
                  onClick={() => setDraft((d) => d && removeWidgetFromDraft(d, widget.id))}
                  className="widget-remove absolute -right-2 -top-2 z-10 flex size-6 items-center justify-center rounded-pill border border-line bg-surface text-muted-foreground shadow-sm hover:text-warning"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
              <WidgetTile type={widget.type} available={availability[widget.type]} />
            </div>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  )
}

/** One pill in the dashboard owner switcher — Household or a household member. */
function SwitcherChip({
  label,
  colour,
  active,
  onClick,
}: {
  label: string
  colour?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-3 py-1 transition-colors',
        active ? 'bg-accent text-white' : 'text-muted-foreground hover:text-ink',
      )}
    >
      {colour && (
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: active ? 'currentColor' : colour }}
          aria-hidden
        />
      )}
      {label}
    </button>
  )
}

/** Widgets that disappear entirely when unavailable rather than showing a
 *  placeholder — the WiFi QR must give nothing away off-network or unconfigured. */
const HIDE_WHEN_UNAVAILABLE: ReadonlySet<WidgetType> = new Set<WidgetType>(['wifiQr'])

/** Render the widget, or a quiet placeholder when it can't show anything now. */
function WidgetTile({ type, available }: { type: WidgetType; available: boolean }) {
  if (!available) {
    if (HIDE_WHEN_UNAVAILABLE.has(type)) return null
    return (
      <WidgetCard title={DASHBOARD_WIDGETS[type].label}>
        <p className="text-sm text-muted-foreground">
          {DASHBOARD_WIDGETS[type].requiresHa
            ? 'Unavailable — needs Home Assistant.'
            : 'Nothing to show right now.'}
        </p>
      </WidgetCard>
    )
  }
  const Component = WIDGET_COMPONENTS[type]
  return <Component />
}

function addWidgetToDraft(draft: DashboardLayout, type: WidgetType): DashboardLayout {
  if (draft.widgets.some((w) => w.id === type)) return draft
  return {
    widgets: [...draft.widgets, { id: type, type }],
    layout: addTiles(draft.layout, type),
  }
}

function removeWidgetFromDraft(draft: DashboardLayout, id: string): DashboardLayout {
  return {
    widgets: draft.widgets.filter((w) => w.id !== id),
    layout: removeTiles(draft.layout, id),
  }
}
