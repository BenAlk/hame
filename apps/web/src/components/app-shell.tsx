import * as React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Calendar,
  ChefHat,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  LogOut,
  type LucideIcon,
  Menu,
  PawPrint,
  Refrigerator,
  Settings,
  ShoppingCart,
  Trash2,
  User,
  UtensilsCrossed,
  Users,
  X,
} from 'lucide-react'
import type { PublicUser } from '@hame/shared'
import { useCurrentUser, useLogout } from '@/api/auth'
import { cn } from '@/lib/utils'

interface NavItemDef {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const PRIMARY_NAV: NavItemDef[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/shopping', label: 'Shopping', icon: ShoppingCart },
  { to: '/pantry', label: 'Pantry', icon: Refrigerator },
  { to: '/recipes', label: 'Recipes', icon: ChefHat },
  { to: '/meal-plan', label: 'Meal plan', icon: UtensilsCrossed },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/chores', label: 'Chores', icon: ListChecks },
  { to: '/bins', label: 'Bins', icon: Trash2 },
  { to: '/pets', label: 'Pets', icon: PawPrint },
  { to: '/smart-home', label: 'Smart home', icon: Lightbulb },
]

const PROFILE_NAV: NavItemDef = { to: '/profile', label: 'Profile', icon: User }

const ADMIN_NAV: NavItemDef[] = [
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/** A single nav link, rendered icon-only on the rail and icon + label when expanded. */
function NavItem({
  item,
  expanded,
  onNavigate,
}: {
  item: NavItemDef
  expanded: boolean
  onNavigate: () => void
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center rounded-control text-sm font-medium transition-colors',
          expanded ? 'gap-3 px-3 py-2' : 'justify-center p-2.5',
          isActive
            ? 'bg-accent-soft text-accent'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      {expanded ? (
        <span>{item.label}</span>
      ) : (
        <>
          <span className="sr-only">{item.label}</span>
          {/* Hover tooltip for the collapsed rail */}
          <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs font-medium text-surface opacity-0 shadow-ambient transition-opacity group-hover:opacity-100">
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

/** Log out control, matched to the nav-item shape. */
function LogoutItem({ expanded, onNavigate }: { expanded: boolean; onNavigate: () => void }) {
  const logout = useLogout()
  return (
    <button
      type="button"
      disabled={logout.isPending}
      onClick={() => {
        onNavigate()
        logout.mutate()
      }}
      className={cn(
        'group relative flex w-full items-center rounded-control text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50',
        expanded ? 'gap-3 px-3 py-2' : 'justify-center p-2.5',
      )}
    >
      <LogOut className="h-5 w-5 shrink-0" aria-hidden />
      {expanded ? (
        <span>Log out</span>
      ) : (
        <>
          <span className="sr-only">Log out</span>
          <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs font-medium text-surface opacity-0 shadow-ambient transition-opacity group-hover:opacity-100">
            Log out
          </span>
        </>
      )}
    </button>
  )
}

/** The shared list of nav items, used by both the rail and the expanded panel. */
function NavItems({
  user,
  expanded,
  onNavigate,
}: {
  user: PublicUser | null
  expanded: boolean
  onNavigate: () => void
}) {
  return (
    <>
      <nav className={cn('flex flex-1 flex-col gap-1', expanded && 'overflow-y-auto')}>
        {PRIMARY_NAV.map((item) => (
          <NavItem key={item.to} item={item} expanded={expanded} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
        <NavItem item={PROFILE_NAV} expanded={expanded} onNavigate={onNavigate} />
        {user?.role === 'ADMIN' &&
          ADMIN_NAV.map((item) => (
            <NavItem key={item.to} item={item} expanded={expanded} onNavigate={onNavigate} />
          ))}
        <LogoutItem expanded={expanded} onNavigate={onNavigate} />
      </div>
    </>
  )
}

/**
 * The app shell: a left sidebar (collapsed icon rail on ≥lg, off-canvas drawer below)
 * plus the routed page content. Expanding the rail slides a labelled panel in over a
 * shroud; on phones the same panel is the only nav, opened from a slim top bar.
 */
export function AppShell() {
  const { data } = useCurrentUser()
  const user = (data as PublicUser | null) ?? null
  const [open, setOpen] = React.useState(false)

  const close = React.useCallback(() => setOpen(false), [])

  // Escape closes the expanded panel / drawer.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <div className="flex min-h-screen">
      {/* Collapsed icon rail — tablet/desktop only */}
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-line bg-surface px-2 py-3 lg:flex">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Expand menu"
          className="mb-2 flex justify-center rounded-control p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <NavItems user={user} expanded={false} onNavigate={close} />
      </aside>

      {/* Slim top bar — phone only */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-2 rounded-control p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="font-serif text-xl font-medium text-ink">Hame</span>
      </header>

      {/* Page content */}
      <div className="min-w-0 flex-1 pt-14 lg:pt-0">
        <Outlet />
      </div>

      {/* Expanded panel + shroud (shared by desktop-expand and phone-drawer) */}
      <div
        className={cn(
          'fixed inset-0 z-40 transition-opacity duration-300',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!open}
      >
        <div
          onClick={close}
          className={cn(
            'absolute inset-0 bg-black/40 transition-opacity duration-300',
            open ? 'opacity-100' : 'opacity-0',
          )}
        />
        <aside
          className={cn(
            'absolute left-0 top-0 flex h-full w-60 flex-col border-r border-line bg-surface px-3 py-3 shadow-ambient transition-transform duration-300 ease-out',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="mb-2 flex items-center justify-between pl-2">
            <span className="font-serif text-xl font-medium text-ink">Hame</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="rounded-control p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <NavItems user={user} expanded onNavigate={close} />
        </aside>
      </div>
    </div>
  )
}
