import { Navigate, Route, Routes } from 'react-router-dom'
import type { PublicUser } from '@hame/shared'
import { SetupPage } from '@/pages/SetupPage'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/pages/HomePage'
import { ShoppingPage } from '@/pages/ShoppingPage'
import { PantryPage } from '@/pages/PantryPage'
import { ChoresPage } from '@/pages/ChoresPage'
import { RecipesPage } from '@/pages/RecipesPage'
import { RecipeDetailPage } from '@/pages/RecipeDetailPage'
import { MealPlanPage } from '@/pages/MealPlanPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { BinsPage } from '@/pages/BinsPage'
import { PetsPage } from '@/pages/PetsPage'
import { PetProfilePage } from '@/pages/PetProfilePage'
import { ProfilePage } from '@/pages/ProfilePage'
import { SettingsPage } from '@/pages/SettingsPage'
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
      <Route path="/shopping" element={<ShoppingPage />} />
      <Route path="/pantry" element={<PantryPage />} />
      <Route path="/chores" element={<ChoresPage />} />
      <Route path="/recipes" element={<RecipesPage />} />
      <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      <Route path="/meal-plan" element={<MealPlanPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/bins" element={<BinsPage />} />
      <Route path="/pets" element={<PetsPage />} />
      <Route path="/pets/:id" element={<PetProfilePage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route
        path="/admin/users"
        element={user.role === 'ADMIN' ? <UsersPage /> : <Navigate to="/" replace />}
      />
      <Route
        path="/settings"
        element={user.role === 'ADMIN' ? <SettingsPage /> : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
