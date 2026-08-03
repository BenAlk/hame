import { useEffect, useState } from 'react'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@hame/shared'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  useNotificationPreferences,
  useNotifyTargets,
  useUpdateNotificationPreferences,
} from '@/api/notifications'

/** Human labels for the reminder categories (order matches the dashboard set). */
const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  binReminders: 'Bin collection reminders',
  choreReminders: 'Chore reminders',
  expiryWarnings: 'Expiring-soon warnings',
  lowStockAlerts: 'Low-stock alerts',
  petCareReminders: 'Pet-care reminders',
  customEventReminders: 'Calendar event reminders',
}

interface Draft {
  binReminders: boolean
  choreReminders: boolean
  expiryWarnings: boolean
  lowStockAlerts: boolean
  petCareReminders: boolean
  customEventReminders: boolean
  pushViaHA: boolean
  haNotifyService: string
  criticalAlerts: boolean
  directNoteAlerts: boolean
  alertBreakThrough: boolean
}

/**
 * A user's notification preferences (spec §8.13, §10 Phase 8). Toggles the
 * reminder categories and points phone push at one of Home Assistant's notify
 * targets. In-app toasts (Phase 8.1) are always on and separate; these gate the
 * scheduled push that HA delivers to the phone.
 */
export function NotificationsCard() {
  const { data: prefs } = useNotificationPreferences()
  const update = useUpdateNotificationPreferences()
  // Only probe HA for phones once a user wants push — a non-HA household never asks.
  const { data: targets } = useNotifyTargets(prefs?.pushViaHA ?? false)

  const [draft, setDraft] = useState<Draft | null>(null)

  // Seed (and reseed) the editable draft when the saved prefs load/refresh.
  useEffect(() => {
    if (!prefs) return
    setDraft({
      binReminders: prefs.binReminders,
      choreReminders: prefs.choreReminders,
      expiryWarnings: prefs.expiryWarnings,
      lowStockAlerts: prefs.lowStockAlerts,
      petCareReminders: prefs.petCareReminders,
      customEventReminders: prefs.customEventReminders,
      pushViaHA: prefs.pushViaHA,
      haNotifyService: prefs.haNotifyService ?? '',
      criticalAlerts: prefs.criticalAlerts,
      directNoteAlerts: prefs.directNoteAlerts,
      alertBreakThrough: prefs.alertBreakThrough,
    })
  }, [prefs])

  if (!draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    )
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))

  const dirty =
    !prefs ||
    NOTIFICATION_CATEGORIES.some((c) => draft[c] !== prefs[c]) ||
    draft.pushViaHA !== prefs.pushViaHA ||
    draft.criticalAlerts !== prefs.criticalAlerts ||
    draft.directNoteAlerts !== prefs.directNoteAlerts ||
    draft.alertBreakThrough !== prefs.alertBreakThrough ||
    draft.haNotifyService !== (prefs.haNotifyService ?? '')

  // Keep the stored target selectable even if HA is currently unreachable.
  const options = targets ?? []
  const hasStored =
    draft.haNotifyService !== '' && !options.some((t) => t.service === draft.haNotifyService)

  const onSave = () => {
    update.mutate({
      binReminders: draft.binReminders,
      choreReminders: draft.choreReminders,
      expiryWarnings: draft.expiryWarnings,
      lowStockAlerts: draft.lowStockAlerts,
      petCareReminders: draft.petCareReminders,
      customEventReminders: draft.customEventReminders,
      pushViaHA: draft.pushViaHA,
      criticalAlerts: draft.criticalAlerts,
      directNoteAlerts: draft.directNoteAlerts,
      alertBreakThrough: draft.alertBreakThrough,
      haNotifyService: draft.haNotifyService === '' ? null : draft.haNotifyService,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          Reminders are pushed to your phone through Home Assistant. In-app messages are always
          shown while you&rsquo;re using Hame.
        </p>

        <div className="flex flex-col gap-3">
          {NOTIFICATION_CATEGORIES.map((category) => (
            <Toggle
              key={category}
              label={CATEGORY_LABELS[category]}
              checked={draft[category]}
              onChange={(next) => set(category, next)}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <Toggle
            label="Push reminders to my phone"
            checked={draft.pushViaHA}
            onChange={(next) => set('pushViaHA', next)}
          />

          {draft.pushViaHA && (
            <div className="flex flex-col gap-3 pl-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notify-target">Phone</Label>
                <select
                  id="notify-target"
                  value={draft.haNotifyService}
                  onChange={(e) => set('haNotifyService', e.target.value)}
                  className="rounded-control border border-input bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Choose a phone —</option>
                  {hasStored && (
                    <option value={draft.haNotifyService}>{draft.haNotifyService}</option>
                  )}
                  {options.map((t) => (
                    <option key={t.service} value={t.service}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {options.length === 0 && !hasStored && (
                  <p className="text-xs text-muted-foreground">
                    No phones found. Connect Home Assistant and install its mobile app to push
                    reminders.
                  </p>
                )}
              </div>

              <Toggle
                label="Critical alerts (break through silent / Do Not Disturb)"
                checked={draft.criticalAlerts}
                disabled={draft.haNotifyService === ''}
                onChange={(next) => set('criticalAlerts', next)}
              />

              <Toggle
                label="Direct QuickNotes sent to me"
                checked={draft.directNoteAlerts}
                disabled={draft.haNotifyService === ''}
                onChange={(next) => set('directNoteAlerts', next)}
              />

              <div className="flex flex-col gap-1.5">
                <Toggle
                  label="Let household alerts turn my phone up"
                  checked={draft.alertBreakThrough}
                  disabled={draft.haNotifyService === ''}
                  onChange={(next) => set('alertBreakThrough', next)}
                />
                <p className="text-xs text-muted-foreground">
                  Android only. A household alert briefly lifts Do Not Disturb, takes the phone off
                  silent and turns the volume up, then puts all three back 20 seconds later. Needs
                  the Home Assistant app's Do Not Disturb permission and its volume, ringer and Do
                  Not Disturb sensors switched on — without those, nothing on your phone is changed.
                </p>
              </div>
            </div>
          )}
        </div>

        <Button onClick={onSave} disabled={!dirty || update.isPending} className="w-full">
          {update.isPending ? 'Saving…' : 'Save preferences'}
        </Button>
      </CardContent>
    </Card>
  )
}

/** A labelled on/off switch (matches the idle/CalDAV settings toggles). */
function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center gap-3 text-left',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'flex h-6 w-11 shrink-0 items-center rounded-pill p-0.5 transition-colors',
          checked ? 'bg-accent' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'size-5 rounded-pill bg-surface transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
    </button>
  )
}
