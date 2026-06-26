import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { DashboardOwner } from '@/api/dashboard'

/**
 * Which owner the dashboard surfaces target (spec §10 Phase 7.1, 7.1b): the
 * signed-in user, or the shared household/tablet. Held in one place so the grid's
 * My⇄Household toggle, the smart-home widget, and the new-device prompt all read
 * and switch the same owner. Persisted in localStorage so the wall tablet stays on
 * Household across reloads — and shared with the /smart-home page (same key), so
 * "which dashboard am I configuring" is one consistent concept across the app.
 */

const STORAGE_KEY = 'hame.dashboard.owner'

function readStoredOwner(): DashboardOwner {
  try {
    return (localStorage.getItem(STORAGE_KEY) as DashboardOwner | null) ?? 'me'
  } catch {
    return 'me'
  }
}

function storeOwner(owner: DashboardOwner): void {
  try {
    localStorage.setItem(STORAGE_KEY, owner)
  } catch {
    /* no-op when storage is unavailable */
  }
}

interface DashboardOwnerContextValue {
  owner: DashboardOwner
  setOwner: (owner: DashboardOwner) => void
}

const DashboardOwnerContext = createContext<DashboardOwnerContextValue | null>(null)

/** Provide one shared owner selection to a page's dashboard + smart-home surfaces. */
export function DashboardOwnerProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<DashboardOwner>(readStoredOwner)
  useEffect(() => storeOwner(owner), [owner])
  return (
    <DashboardOwnerContext.Provider value={{ owner, setOwner }}>
      {children}
    </DashboardOwnerContext.Provider>
  )
}

export function useDashboardOwner(): DashboardOwnerContextValue {
  const ctx = useContext(DashboardOwnerContext)
  if (!ctx) throw new Error('useDashboardOwner must be used within a DashboardOwnerProvider')
  return ctx
}
