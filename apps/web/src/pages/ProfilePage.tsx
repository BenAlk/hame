import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { UpdateProfileSchema, type UpdateProfileInput } from '@hame/shared'
import { FormField } from '@/components/form-field'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalDavCard } from '@/components/features/caldav/caldav-card'
import { useCurrentUser } from '@/api/auth'
import { useUpdateProfile } from '@/api/users'
import { applyApiErrors } from '@/lib/form'

/** ISO date string → "YYYY-MM-DD" for a date input. */
function toDateInput(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10)
}

export function ProfilePage() {
  const { data: user } = useCurrentUser()
  const updateProfile = useUpdateProfile()
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      surname: user?.surname ?? '',
      colour: user?.colour ?? '#000000',
      dob: user ? (toDateInput(user.dob) as unknown as Date) : undefined,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setStatus(null)
    try {
      await updateProfile.mutateAsync(values)
      setStatus({ tone: 'ok', message: 'Profile updated.' })
    } catch (err) {
      setStatus({ tone: 'error', message: applyApiErrors(err, setError) ?? 'Update failed.' })
    }
  })

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-medium text-ink">Your profile</h1>
        <Link to="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          Back
        </Link>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{user?.username}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <FormField label="First name" htmlFor="firstName" error={errors.firstName?.message}>
              <Input id="firstName" autoComplete="given-name" {...register('firstName')} />
            </FormField>
            <FormField label="Surname" htmlFor="surname" error={errors.surname?.message}>
              <Input id="surname" autoComplete="family-name" {...register('surname')} />
            </FormField>
            <FormField label="Date of birth" htmlFor="dob" error={errors.dob?.message}>
              <Input id="dob" type="date" {...register('dob')} />
            </FormField>
            <FormField label="Colour" htmlFor="colour" error={errors.colour?.message}>
              <Input id="colour" type="color" className="h-10 w-20 p-1" {...register('colour')} />
            </FormField>
            <FormField label="New password" htmlFor="password" error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to keep current"
                {...register('password', { setValueAs: (v) => (v === '' ? undefined : v) })}
              />
            </FormField>

            {status && (
              <p className={status.tone === 'ok' ? 'text-sm text-sage' : 'text-sm text-warning'}>
                {status.message}
              </p>
            )}

            <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <CalDavCard />
    </main>
  )
}
