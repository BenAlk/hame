import { Navigate, Route, Routes } from 'react-router-dom'
import type { PublicUser } from '@hame/shared'
import { SetupPage } from '@/pages/SetupPage'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/pages/HomePage'
import { ProfilePage } from '@/pages/ProfilePage'
import { UsersPage } from '@/pages/admin/UsersPage'

interface AuthGateProps {
  requiresSetup: boolean
  user: PublicUser | null
}

/**
 * Pure routing gate (no data fetching, so it's trivially testable):
 *   needs setup → only /setup; unauthenticated → only /login; otherwise the app.
 * Anything outside the allowed set redirects to that state's entry point.
 */
export function AuthGate({ requiresSetup, user }: AuthGateProps) {
  if (requiresSetup) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route
        path="/admin/users"
        element={user.role === 'ADMIN' ? <UsersPage /> : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
