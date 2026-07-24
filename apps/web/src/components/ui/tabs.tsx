import { cn } from '@/lib/utils'

export interface TabItem {
  value: string
  label: string
}

/**
 * A horizontal, underline-style tab bar (Hearth §6). Purely presentational:
 * the caller owns the active value and renders the matching panel itself.
 */
export function Tabs({
  tabs,
  value,
  onValueChange,
  className,
}: {
  tabs: TabItem[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn('flex items-center gap-1', className)}
    >
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              '-mb-px shrink-0 whitespace-nowrap rounded-t-control border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-accent text-ink'
                : 'border-transparent text-muted-foreground hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
