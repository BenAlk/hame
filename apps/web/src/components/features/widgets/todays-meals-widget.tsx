import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import type { MealType } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { useMealPlan } from '@/api/meal-plans'

const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
}
const MEAL_ORDER: Record<MealType, number> = { BREAKFAST: 0, LUNCH: 1, DINNER: 2, SNACK: 3 }

/** Today's planned meals (spec §8.12). */
export function TodaysMealsWidget() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: entries, isPending } = useMealPlan(today, today)
  const meals = [...(entries ?? [])].sort((a, b) => MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType])

  return (
    <WidgetCard
      title="Today's meals"
      footer={
        <Link to="/meal-plan" className="inline-block text-xs text-accent hover:underline">
          Open meal plan
        </Link>
      }
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : meals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing planned today.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {meals.map((entry) => (
            <li key={entry.id} className="flex items-baseline gap-3 py-1 text-sm">
              <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {MEAL_LABEL[entry.mealType]}
              </span>
              {entry.recipe ? (
                <Link
                  to={`/recipes/${entry.recipe.id}`}
                  className="min-w-0 flex-1 truncate text-ink hover:text-accent"
                >
                  {entry.recipe.title}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate text-ink">{entry.customLabel}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}
