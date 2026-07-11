import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { SetupSchema, DEFAULT_USER_COLOUR } from '@hame/shared'
import { AuthLayout } from '@/components/auth-layout'
import { FormField } from '@/components/form-field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useSetup } from '@/api/auth'
import { applyApiErrors } from '@/lib/form'

// Setup form adds a confirm-password field (UI-only) that must match.
const SetupFormSchema = SetupSchema.extend({
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})
type SetupFormValues = z.infer<typeof SetupFormSchema>

export function SetupPage() {
  const navigate = useNavigate()
  const setup = useSetup()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SetupFormValues>({
    resolver: zodResolver(SetupFormSchema),
    defaultValues: {
      setupToken: '',
      username: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      surname: '',
      colour: DEFAULT_USER_COLOUR,
    },
  })

  const onSubmit = handleSubmit(async ({ confirmPassword: _confirm, ...payload }) => {
    setFormError(null)
    try {
      await setup.mutateAsync(payload)
      navigate('/login', { replace: true })
    } catch (err) {
      setFormError(applyApiErrors(err, setError))
    }
  })

  return (
    <AuthLayout
      title="Create your admin account"
      subtitle="First run — let's set up the household."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormField
          label="Setup token"
          htmlFor="setupToken"
          error={errors.setupToken?.message}
          hint="Printed in your server logs on first run (e.g. docker logs hame-api)."
        >
          <Input
            id="setupToken"
            autoComplete="off"
            autoFocus
            spellCheck={false}
            {...register('setupToken')}
          />
        </FormField>
        <FormField label="First name" htmlFor="firstName" error={errors.firstName?.message}>
          <Input id="firstName" autoComplete="given-name" {...register('firstName')} />
        </FormField>
        <FormField label="Surname" htmlFor="surname" error={errors.surname?.message}>
          <Input id="surname" autoComplete="family-name" {...register('surname')} />
        </FormField>
        <FormField label="Username" htmlFor="username" error={errors.username?.message}>
          <Input id="username" autoComplete="username" {...register('username')} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
        </FormField>
        <FormField
          label="Confirm password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
        </FormField>
        <FormField label="Date of birth" htmlFor="dob" error={errors.dob?.message}>
          <Input id="dob" type="date" {...register('dob')} />
        </FormField>
        <FormField label="Colour" htmlFor="colour" error={errors.colour?.message}>
          <Input id="colour" type="color" className="h-10 w-20 p-1" {...register('colour')} />
        </FormField>

        {formError && <p className="text-sm text-warning">{formError}</p>}

        <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create admin account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
