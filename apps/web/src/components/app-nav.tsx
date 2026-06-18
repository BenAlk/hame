import { NavLink } from 'react-router-dom'
import type { PublicUser } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { useLogout } from '@/api/auth'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/shopping', label: 'Shopping' },
  { to: '/pantry', label: 'Pantry' },
] as const

/** Primary in-app navigation, shared across pages. */
export function AppNav({ user }: { user: PublicUser | null }) {
  const logout = useLogout()

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={'end' in link ? link.end : undefined}
          className={({ isActive }) =>
            cn(
              'rounded-control px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          {link.label}
        </NavLink>
      ))}
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <NavLink
        to="/profile"
        className={({ isActive }) =>
          cn(
            'rounded-control px-3 py-1.5 text-sm font-medium transition-colors',
            isActive
              ? 'bg-accent-soft text-accent'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )
        }
      >
        Profile
      </NavLink>
      {user?.role === 'ADMIN' && (
        <NavLink
          to="/admin/users"
          className={({ isActive }) =>
            cn(
              'rounded-control px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          Users
        </NavLink>
      )}
      <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
        Log out
      </Button>
    </nav>
  )
}
