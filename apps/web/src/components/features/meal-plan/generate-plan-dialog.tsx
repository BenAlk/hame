import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Dices, Plus, RefreshCw, Lock, X } from 'lucide-react'
import type { MealPlanEntry, MealType, MealTypeQuota, RecipeSummary, Tag } from '@hame/shared'
import { generateMealPlan, pickForSlot } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/api/client'
import { useApplyGeneratedMealPlan } from '@/api/meal-plans'

const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
}

interface GeneratePlanDialogProps {
  days: Date[]
  enabledMealTypes: MealType[]
  /** The week's current entries — manual ones lock their slot (spec §8.6). */
  entries: MealPlanEntry[]
  recipes: RecipeSummary[]
  onClose: () => void
}

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

/** UTC calendar day of an entry's `@db.Date` (round-trips as midnight UTC). */
function entryDayKey(value: MealPlanEntry['date']): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10)
}

/**
 * "Generate meal plan" (spec §8.6). Rolls recipes into the week's generatable
 * slots — empty ones, or ones holding a previous auto-pick; manual entries are
 * locked and never touched. Recipes are eligible for a slot only when their
 * `mealTypes` include it. Optional per-slot tag quotas steer the mix (a roast
 * dinner ×2). Preview with per-day and whole-week reroll, then Apply persists.
 */
export function GeneratePlanDialog({
  days,
  enabledMealTypes,
  entries,
  recipes,
  onClose,
}: GeneratePlanDialogProps) {
  const apply = useApplyGeneratedMealPlan()
  const [quotas, setQuotas] = useState<Partial<Record<MealType, MealTypeQuota[]>>>({})
  const [proposal, setProposal] = useState<Map<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes])
  const dayKeys = useMemo(() => days.map(dayKey), [days])

  // Manual entries lock their cell; generated ones may be re-rolled over.
  const lockedCells = useMemo(() => {
    const map = new Map<string, MealPlanEntry>()
    for (const e of entries) {
      if (!e.isGenerated) map.set(`${entryDayKey(e.date)}|${e.mealType}`, e)
    }
    return map
  }, [entries])

  // Meal types worth generating: enabled AND with at least one eligible recipe.
  const generatableTypes = useMemo(
    () => enabledMealTypes.filter((mt) => recipes.some((r) => r.mealTypes.includes(mt))),
    [enabledMealTypes, recipes],
  )

  // Tags available to quota a given meal type (union across its eligible recipes).
  const tagsByType = useMemo(() => {
    const map = new Map<MealType, Tag[]>()
    for (const mt of generatableTypes) {
      const seen = new Map<string, Tag>()
      for (const r of recipes) {
        if (!r.mealTypes.includes(mt)) continue
        for (const t of r.tags) seen.set(t.id, t)
      }
      map.set(
        mt,
        [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
      )
    }
    return map
  }, [generatableTypes, recipes])

  function generatableSlots() {
    const slots: { date: string; mealType: MealType }[] = []
    for (const dk of dayKeys) {
      for (const mt of enabledMealTypes) {
        if (!lockedCells.has(`${dk}|${mt}`)) slots.push({ date: dk, mealType: mt })
      }
    }
    return slots
  }

  function rollAll() {
    const picks = generateMealPlan({ slots: generatableSlots(), recipes, quotas })
    const map = new Map<string, string>()
    for (const p of picks) map.set(`${p.date}|${p.mealType}`, p.recipeId)
    setProposal(map)
  }

  function rerollDay(dk: string) {
    setProposal((prev) => {
      const map = new Map(prev ?? [])
      for (const mt of enabledMealTypes) {
        const key = `${dk}|${mt}`
        if (lockedCells.has(key)) continue
        const picked = pickForSlot({ mealType: mt, recipes, excludeId: map.get(key) ?? null })
        if (picked) map.set(key, picked)
        else map.delete(key)
      }
      return map
    })
  }

  // Quota editing --------------------------------------------------------------
  function setTypeQuotas(mt: MealType, rows: MealTypeQuota[]) {
    setQuotas((q) => ({ ...q, [mt]: rows }))
  }
  function addQuota(mt: MealType) {
    const firstTag = tagsByType.get(mt)?.[0]
    if (!firstTag) return
    setTypeQuotas(mt, [...(quotas[mt] ?? []), { tagId: firstTag.id, count: 1 }])
  }

  async function handleApply() {
    if (!proposal) return
    setError(null)
    const body = []
    for (const dk of dayKeys) {
      for (const mt of enabledMealTypes) {
        const recipeId = proposal.get(`${dk}|${mt}`)
        if (recipeId) body.push({ date: new Date(dk), mealType: mt, recipeId })
      }
    }
    try {
      await apply.mutateAsync({
        startDate: new Date(dayKeys[0]),
        endDate: new Date(dayKeys[dayKeys.length - 1]),
        mealTypes: enabledMealTypes,
        entries: body,
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the plan.')
    }
  }

  if (generatableTypes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink">
          None of your recipes are marked for the enabled meal slots yet. Open a recipe and set its{' '}
          <span className="font-medium">Meal slots</span> (breakfast/lunch/dinner) so the generator
          can pick it.
        </p>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Quota config */}
      <div className="flex flex-col gap-3">
        <div>
          <Label>Steer the mix (optional)</Label>
          <p className="text-xs text-muted-foreground">
            Ask for a tag to appear a set number of times that week — e.g. a roast dinner ×2. The
            rest is filled at random.
          </p>
        </div>
        {generatableTypes.map((mt) => {
          const rows = quotas[mt] ?? []
          const tags = tagsByType.get(mt) ?? []
          return (
            <div key={mt} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {MEAL_LABEL[mt]}
                </span>
                {tags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => addQuota(mt)}
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <Plus className="size-3.5" /> Add rule
                  </button>
                )}
              </div>
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={row.tagId}
                    onChange={(e) =>
                      setTypeQuotas(
                        mt,
                        rows.map((r, idx) => (idx === i ? { ...r, tagId: e.target.value } : r)),
                      )
                    }
                    className="h-10 flex-1 rounded-control border border-input bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-muted-foreground">×</span>
                  <input
                    type="number"
                    min={1}
                    max={days.length}
                    value={row.count}
                    onChange={(e) =>
                      setTypeQuotas(
                        mt,
                        rows.map((r, idx) =>
                          idx === i
                            ? {
                                ...r,
                                count: Math.max(
                                  1,
                                  Math.min(days.length, Number(e.target.value) || 1),
                                ),
                              }
                            : r,
                        ),
                      )
                    }
                    className="h-10 w-16 rounded-control border border-input bg-surface px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setTypeQuotas(
                        mt,
                        rows.filter((_, idx) => idx !== i),
                      )
                    }
                    aria-label="Remove rule"
                    className="shrink-0 rounded-control p-2 text-muted-foreground hover:bg-muted hover:text-warning"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <Button type="button" onClick={rollAll} className="self-start">
        {proposal ? <RefreshCw className="size-4" /> : <Dices className="size-4" />}
        {proposal ? 'Reroll all' : 'Generate'}
      </Button>

      {/* Proposal preview */}
      {proposal && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {days.map((day) => {
            const dk = dayKey(day)
            return (
              <div
                key={dk}
                className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">
                    {format(day, 'EEE')}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      {format(day, 'd MMM')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => rerollDay(dk)}
                    aria-label={`Reroll ${format(day, 'EEE d MMM')}`}
                    className="rounded-control p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-accent"
                  >
                    <Dices className="size-4" />
                  </button>
                </div>
                {enabledMealTypes.map((mt) => {
                  const key = `${dk}|${mt}`
                  const locked = lockedCells.get(key)
                  const picked = proposal.get(key)
                  return (
                    <div key={mt} className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {MEAL_LABEL[mt]}
                      </span>
                      {locked ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="size-3" />
                          {locked.recipe?.title ?? locked.customLabel ?? 'Kept'}
                        </span>
                      ) : picked ? (
                        <span className="truncate text-xs text-ink">
                          {recipeById.get(picked)?.title ?? 'Recipe'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="text-sm text-warning">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void handleApply()}
          disabled={!proposal || apply.isPending}
        >
          {apply.isPending ? 'Saving…' : 'Apply to week'}
        </Button>
      </div>
    </div>
  )
}
