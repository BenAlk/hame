import { useMemo, useState } from 'react'
import { addDays, addWeeks, format, isToday, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Settings2, ShoppingCart } from 'lucide-react'
import type { CreateMealPlanEntryInput, MealPlanEntry, MealType, PublicUser } from '@hame/shared'
import { MEAL_TYPES } from '@hame/shared'
import { AppNav } from '@/components/app-nav'
import { MealEntryForm } from '@/components/features/meal-plan/meal-entry-form'
import { GenerateListDialog } from '@/components/features/meal-plan/generate-list-dialog'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ApiError } from '@/api/client'
import { useCurrentUser } from '@/api/auth'
import { useRecipes } from '@/api/recipes'
import { useHouseholdSettings, useUpdateHouseholdSettings } from '@/api/household-settings'
import {
  useCreateMealPlanEntry,
  useDeleteMealPlanEntry,
  useMealPlan,
  useUpdateMealPlanEntry,
} from '@/api/meal-plans'
import { cn } from '@/lib/utils'

const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
}

/** UTC calendar day of an entry's stored @db.Date (round-trips as midnight UTC). */
function entryDayKey(value: MealPlanEntry['date']): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10)
}

function entryTitle(entry: MealPlanEntry): string {
  return entry.recipe?.title ?? entry.customLabel ?? 'Meal'
}

export function MealPlanPage() {
  const { data: me } = useCurrentUser()
  const isAdmin = (me as PublicUser | null)?.role === 'ADMIN'

  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = useMemo(
    () => addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset),
    [weekOffset],
  )
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const fromKey = format(weekStart, 'yyyy-MM-dd')
  const toKey = format(days[6], 'yyyy-MM-dd')

  const { data: entries } = useMealPlan(fromKey, toKey)
  const { data: recipes } = useRecipes()
  const { data: settings } = useHouseholdSettings()
  const enabledMealTypes = settings?.enabledMealTypes ?? ['DINNER']

  const createEntry = useCreateMealPlanEntry()
  const updateEntry = useUpdateMealPlanEntry()
  const deleteEntry = useDeleteMealPlanEntry()
  const updateSettings = useUpdateHouseholdSettings()

  const [editing, setEditing] = useState<{
    entry?: MealPlanEntry
    date: string
    mealType: MealType
  } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Index entries by "yyyy-mm-dd|MEALTYPE" for O(1) cell lookups.
  const byCell = useMemo(() => {
    const map = new Map<string, MealPlanEntry[]>()
    for (const entry of entries ?? []) {
      const key = `${entryDayKey(entry.date)}|${entry.mealType}`
      const list = map.get(key)
      if (list) list.push(entry)
      else map.set(key, [entry])
    }
    return map
  }, [entries])

  async function handleSubmit(input: CreateMealPlanEntryInput) {
    setError(null)
    try {
      if (editing?.entry) await updateEntry.mutateAsync({ id: editing.entry.id, ...input })
      else await createEntry.mutateAsync(input)
      setEditing(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the meal.')
    }
  }

  async function handleDelete() {
    if (!editing?.entry) return
    await deleteEntry.mutateAsync(editing.entry.id)
    setEditing(null)
  }

  function toggleMealType(type: MealType) {
    const next = enabledMealTypes.includes(type)
      ? enabledMealTypes.filter((m) => m !== type)
      : [...enabledMealTypes, type]
    if (next.length === 0) return // keep at least one enabled
    void updateSettings.mutateAsync({ enabledMealTypes: next })
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Meal plan</h1>
        <AppNav user={(me as PublicUser | null) ?? null} />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => setWeekOffset((w) => w - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-44 text-center text-sm font-medium text-ink">
            {format(weekStart, 'd MMM')} – {format(days[6], 'd MMM yyyy')}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => setWeekOffset((w) => w + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
              This week
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="size-4" />
              Meal types
            </Button>
          )}
          <Button onClick={() => setGenerating(true)}>
            <ShoppingCart className="size-4" />
            Generate shopping list
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd')
          return (
            <div
              key={dayKey}
              className={cn(
                'flex flex-col gap-2 rounded-card border border-line bg-surface p-3',
                isToday(day) && 'border-accent',
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-ink">{format(day, 'EEE')}</span>
                <span
                  className={cn(
                    'text-xs',
                    isToday(day) ? 'font-bold text-accent' : 'text-muted-foreground',
                  )}
                >
                  {format(day, 'd MMM')}
                </span>
              </div>

              {enabledMealTypes.map((mealType) => {
                const cellEntries = byCell.get(`${dayKey}|${mealType}`) ?? []
                return (
                  <div key={mealType} className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {MEAL_LABEL[mealType]}
                    </span>
                    {cellEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setError(null)
                          setEditing({ entry, date: dayKey, mealType })
                        }}
                        className="rounded-control border border-line bg-accent-soft/40 px-2 py-1 text-left text-xs text-ink transition-colors hover:border-accent"
                      >
                        {entryTitle(entry)}
                        {entry.servings != null && (
                          <span className="text-muted-foreground"> · {entry.servings}</span>
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setEditing({ date: dayKey, mealType })
                      }}
                      aria-label={`Add ${MEAL_LABEL[mealType]} on ${format(day, 'EEE d MMM')}`}
                      className="flex items-center justify-center rounded-control border border-dashed border-line py-1 text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Add / edit entry */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.entry ? 'Edit meal' : 'Add meal'}
      >
        {editing && (
          <MealEntryForm
            entry={editing.entry}
            date={editing.date}
            mealType={editing.mealType}
            enabledMealTypes={enabledMealTypes}
            recipes={recipes ?? []}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
            onDelete={editing.entry ? () => void handleDelete() : undefined}
            submitting={createEntry.isPending || updateEntry.isPending}
            error={error}
          />
        )}
      </Modal>

      {/* Generate shopping list */}
      <Modal open={generating} onClose={() => setGenerating(false)} title="Generate shopping list">
        <GenerateListDialog
          defaultStart={fromKey}
          defaultEnd={toKey}
          onClose={() => setGenerating(false)}
        />
      </Modal>

      {/* Meal-type settings (admin) */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Meal types">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Choose which meals appear in the planner. At least one stays on.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MEAL_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleMealType(type)}
                aria-pressed={enabledMealTypes.includes(type)}
                disabled={updateSettings.isPending}
                className={cn(
                  'rounded-pill border px-3 py-1.5 text-sm font-medium transition-colors',
                  enabledMealTypes.includes(type)
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-muted-foreground hover:border-accent',
                )}
              >
                {MEAL_LABEL[type]}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setSettingsOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  )
}
