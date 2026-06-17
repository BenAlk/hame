import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PublicUser } from '@hame/shared'
import { AuthGate } from './auth-gate'

function renderAt(path: string, props: { requiresSetup: boolean; user: PublicUser | null }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AuthGate {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const adminUser: PublicUser = {
  id: 'a1',
  username: 'ben',
  firstName: 'Ben',
  surname: 'Alkureishi',
  avatarUrl: null,
  colour: '#3B82F6',
  dob: new Date('1990-01-01'),
  role: 'ADMIN',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('AuthGate', () => {
  it('forces the setup wizard when setup is required', () => {
    renderAt('/', { requiresSetup: true, user: null })
    expect(screen.getByText('Create your admin account')).toBeInTheDocument()
  })

  it('redirects an unauthenticated user to login', () => {
    renderAt('/', { requiresSetup: false, user: null })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the dashboard to an authenticated user', () => {
    renderAt('/', { requiresSetup: false, user: adminUser })
    expect(screen.getByText(/Welcome to your household/i)).toBeInTheDocument()
  })

  it('keeps a non-admin out of the admin users page', () => {
    renderAt('/admin/users', { requiresSetup: false, user: { ...adminUser, role: 'MEMBER' } })
    // Redirected to dashboard rather than the user-management screen.
    expect(screen.queryByText('Household users')).not.toBeInTheDocument()
    expect(screen.getByText(/Welcome to your household/i)).toBeInTheDocument()
  })
})
