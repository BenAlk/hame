import * as React from 'react'
import { cn } from '@/lib/utils'

interface WidgetCardProps {
  /** Uppercase label shown in the header (design §6). */
  title: string
  /** Optional count/affordance rendered on the right of the header. */
  action?: React.ReactNode
  /** Optional footer (e.g. an "Open …" link), pinned to the bottom of the card. */
  footer?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * The shared widget shell (design-specification.md §6): surface fill, hairline
 * border, 20px radius, generous padding, an uppercase muted header label.
 *
 * Laid out as a column so the body grows to fill the tile and the optional
 * footer sits at a consistent bottom edge regardless of how much content the
 * widget has (the dashboard grid stretches each card to `h-full`).
 */
export function WidgetCard({ title, action, footer, className, children }: WidgetCardProps) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-card border border-line bg-surface p-5 text-ink',
        className,
      )}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        {action != null && <div className="text-xs text-muted-foreground">{action}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer != null && <div className="mt-3 shrink-0">{footer}</div>}
    </section>
  )
}
