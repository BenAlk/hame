import { cn } from '@/lib/utils'

/**
 * The pill switch shared by every on/off control on the dashboard — lights,
 * switches and fans on the smart-home widget, and a thermostat's on/off on the
 * heating one (design §6 "Toggle"). Lives apart from either widget so on/off
 * reads identically wherever it appears.
 */
export function ToggleSwitch({
  on,
  busy,
  ariaLabel,
  onToggle,
}: {
  on: boolean
  busy: boolean
  ariaLabel: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={busy}
      onClick={onToggle}
      className={cn(
        'relative h-6 w-[42px] shrink-0 rounded-pill transition-colors disabled:opacity-50',
        on ? 'bg-accent' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-5 rounded-pill bg-surface shadow-sm transition-all',
          on ? 'left-[19px]' : 'left-0.5',
        )}
      />
    </button>
  )
}
