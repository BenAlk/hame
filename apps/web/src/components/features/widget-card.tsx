import * as React from 'react'
import { cn } from '@/lib/utils'

interface WidgetCardProps {
  /** Uppercase label shown in the header (design §6). */
  title: string
  /** Optional count/affordance rendered on the right of the header. */
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * The shared widget shell (design-specification.md §6): surface fill, hairline
 * border, 20px radius, generous padding, an uppercase muted header label.
 */
export function WidgetCard({ title, action, className, children }: WidgetCardProps) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-5 text-ink', className)}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        {action != null && <div className="text-xs text-muted-foreground">{action}</div>}
      </header>
      {children}
    </section>
  )
}
