import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { LoginSchema, type LoginInput } from '@hame/shared'
import { AuthLayout } from '@/components/auth-layout'
import { FormField } from '@/components/form-field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useLogin } from '@/api/auth'
import { applyApiErrors } from '@/lib/form'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { username: '', password: '', trustDevice: false },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login.mutateAsync(values)
      navigate('/', { replace: true })
    } catch (err) {
      setFormError(applyApiErrors(err, setError))
    }
  })

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your household.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormField label="Username" htmlFor="username" error={errors.username?.message}>
          <Input id="username" autoComplete="username" {...register('username')} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="size-4 accent-accent" {...register('trustDevice')} />
          Keep me signed in on this device
        </label>

        {formError && <p className="text-sm text-warning">{formError}</p>}

        <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
