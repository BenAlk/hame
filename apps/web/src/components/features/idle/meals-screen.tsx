import type { MealPlanEntry, MealType } from '@hame/shared'

const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
}

/**
 * Idle info screen for the current meal (spec §8.14). With a recipe photo it's a
 * full-bleed image with the title over a soft gradient; a custom label ("Takeaway")
 * or an image-less recipe falls back to a stylised typographic card on terracotta
 * rather than a broken image.
 */
export function MealsScreen({ entry }: { entry: MealPlanEntry }) {
  const slot = MEAL_LABEL[entry.mealType]
  const title = entry.recipe?.title ?? entry.customLabel ?? 'Meal planned'
  const image = entry.recipe?.imageUrl ?? null

  if (!image) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-accent px-8 text-center text-white">
        <p className="text-sm font-bold uppercase tracking-[0.35em] text-white/80">{slot}</p>
        <h1 className="max-w-[80vw] font-serif text-6xl font-medium leading-tight sm:text-7xl">
          {title}
        </h1>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {/* darken the lower third so the title stays legible over any photo */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-10 text-white sm:p-14">
        <p className="text-sm font-bold uppercase tracking-[0.35em] text-white/85">{slot}</p>
        <h1 className="mt-2 max-w-[85vw] font-serif text-5xl font-medium leading-tight drop-shadow sm:text-7xl">
          {title}
        </h1>
      </div>
    </div>
  )
}
