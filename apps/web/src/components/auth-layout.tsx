import * as React from 'react'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

/** Centered single-card shell for the setup and login screens. */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center py-12">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-5xl font-medium tracking-tight text-ink">Hame</h1>
        {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-6">
        <h2 className="mb-5 font-serif text-2xl font-medium text-ink">{title}</h2>
        {children}
      </div>
    </main>
  )
}
