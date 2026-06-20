import { Link } from 'react-router-dom'
import { Clock, Users } from 'lucide-react'
import type { RecipeSummary } from '@hame/shared'
import { TagChip } from '@/components/features/tag-chip'

/** A recipe tile in the library grid. Image falls back to a paper placeholder. */
export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const totalTime = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0)
  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface text-ink transition-colors hover:border-accent"
    >
      {recipe.imageUrl ? (
        <img
          src={recipe.imageUrl}
          alt=""
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center border-b border-dashed border-line bg-accent-soft/50">
          <span className="font-mono text-xs text-muted-foreground">recipe photo</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-serif text-lg font-medium leading-tight">{recipe.title}</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {totalTime > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {totalTime} min
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {recipe.servings}
          </span>
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {recipe.tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
