import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  CreateUserSchema,
  type CreateUserInput,
  type PublicUser,
  type TabletCredentials,
  DEFAULT_USER_COLOUR,
} from '@hame/shared'
import { FormField } from '@/components/form-field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { ApiError } from '@/api/client'
import { useCurrentUser } from '@/api/auth'
import {
  useCreateTablet,
  useCreateUser,
  useDeleteUser,
  useResetTablet,
  useTabletAccount,
  useUpdateUser,
  useUsers,
} from '@/api/users'
import { applyApiErrors } from '@/lib/form'

export function UsersPage() {
  const { data: me } = useCurrentUser()
  const { data: users, isPending } = useUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const [actionError, setActionError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PublicUser | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: {
      username: '',
      password: '',
      firstName: '',
      surname: '',
      colour: DEFAULT_USER_COLOUR,
      role: 'MEMBER',
    },
  })

  const onCreate = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await createUser.mutateAsync(values)
      reset()
    } catch (err) {
      setFormError(applyApiErrors(err, setError))
    }
  })

  async function runAction(action: Promise<unknown>) {
    setActionError(null)
    try {
      await action
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.')
    }
  }

  function toggleRole(user: PublicUser) {
    void runAction(
      updateUser.mutateAsync({ id: user.id, role: user.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' }),
    )
  }

  async function confirmDeleteUser() {
    if (!confirmDelete) return
    await runAction(deleteUser.mutateAsync(confirmDelete.id))
    setConfirmDelete(null)
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <h1 className="font-serif text-3xl font-medium text-ink">Household users</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col lg:h-full">
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="relative min-h-0 flex-1 p-0">
            <div className="flex flex-col gap-2 overflow-y-auto p-5 pt-0 lg:absolute lg:inset-0">
              {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
              {users?.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-inner border border-line px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="inline-block size-3 shrink-0 rounded-pill"
                      style={{ backgroundColor: user.colour }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {user.firstName} {user.surname}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                    </div>
                    <span className="shrink-0 rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                      {user.role}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleRole(user)}>
                      {user.role === 'ADMIN' ? 'Make member' : 'Make admin'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={user.id === me?.id}
                      onClick={() => setConfirmDelete(user)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              {actionError && <p className="text-sm text-warning">{actionError}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a user</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="flex flex-col gap-4" noValidate>
              <FormField
                label="First name"
                htmlFor="new-firstName"
                error={errors.firstName?.message}
              >
                <Input id="new-firstName" autoComplete="given-name" {...register('firstName')} />
              </FormField>
              <FormField label="Surname" htmlFor="new-surname" error={errors.surname?.message}>
                <Input id="new-surname" autoComplete="family-name" {...register('surname')} />
              </FormField>
              <FormField label="Username" htmlFor="new-username" error={errors.username?.message}>
                <Input id="new-username" {...register('username')} />
              </FormField>
              <FormField label="Password" htmlFor="new-password" error={errors.password?.message}>
                <Input id="new-password" type="password" {...register('password')} />
              </FormField>
              <FormField label="Date of birth" htmlFor="new-dob" error={errors.dob?.message}>
                <Input id="new-dob" type="date" {...register('dob')} />
              </FormField>
              <FormField label="Colour" htmlFor="new-colour" error={errors.colour?.message}>
                <Input
                  id="new-colour"
                  type="color"
                  className="h-10 w-20 p-1"
                  {...register('colour')}
                />
              </FormField>
              <FormField label="Role" htmlFor="new-role" error={errors.role?.message}>
                <select
                  id="new-role"
                  className="flex h-10 w-full rounded-control border border-input bg-surface px-3 text-sm text-ink"
                  {...register('role')}
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </FormField>

              {formError && <p className="text-sm text-warning">{formError}</p>}

              <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Adding…' : 'Add user'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <TabletAccountCard />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete member?"
      >
        <p className="text-sm text-ink">
          Delete{' '}
          <span className="font-semibold">
            {confirmDelete?.firstName} {confirmDelete?.surname}
          </span>
          ? Their chores, lists, items and history will be reassigned to{' '}
          <span className="font-semibold">{(me as PublicUser | null)?.firstName ?? 'you'}</span>.
          This can&apos;t be undone.
        </p>
        {actionError && <p className="mt-3 text-sm text-warning">{actionError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteUser.isPending}
            onClick={() => void confirmDeleteUser()}
          >
            {deleteUser.isPending ? 'Deleting…' : 'Delete member'}
          </Button>
        </div>
      </Modal>
    </main>
  )
}

/**
 * The shared wall-tablet account (spec §8.1): a first-class, non-admin login the
 * wall tablet uses to page through everyone's dashboards read-only. One is
 * auto-created at first-run setup; from here an admin can provision one if it's
 * missing, or re-issue its password. Either action returns the login **once**.
 */
function TabletAccountCard() {
  const { data, isPending } = useTabletAccount()
  const createTablet = useCreateTablet()
  const resetTablet = useResetTablet()
  const [creds, setCreds] = useState<TabletCredentials | null>(null)
  const [error, setError] = useState<string | null>(null)

  const account = data?.account ?? null
  const busy = createTablet.isPending || resetTablet.isPending

  async function run(action: Promise<TabletCredentials>) {
    setError(null)
    try {
      setCreds(await action)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wall-tablet account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A shared login for the wall tablet. It can page through everyone’s dashboards but has no
          access to settings, and isn’t a household member (no chores, reminders or stats). Its
          password is only ever shown once — re-issue it here if the tablet needs signing in again.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {isPending ? (
              <span className="text-muted-foreground">Loading…</span>
            ) : account ? (
              <span className="text-ink">
                Active · <span className="font-mono">@{account.username}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Not set up yet.</span>
            )}
          </div>
          {account ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(resetTablet.mutateAsync())}
            >
              {resetTablet.isPending ? 'Working…' : 'Reset password'}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy || isPending}
              onClick={() => void run(createTablet.mutateAsync())}
            >
              {createTablet.isPending ? 'Creating…' : 'Create tablet account'}
            </Button>
          )}
        </div>

        {creds && (
          <dl className="rounded-inner border border-accent/40 bg-accent-soft p-4 text-sm">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
              Save this now — it isn’t shown again
            </p>
            <div className="flex items-center justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Username</dt>
              <dd className="font-mono text-ink">{creds.username}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Password</dt>
              <dd className="font-mono text-ink">{creds.password}</dd>
            </div>
          </dl>
        )}

        {error && <p className="text-sm text-warning">{error}</p>}
      </CardContent>
    </Card>
  )
}
