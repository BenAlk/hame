import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { DraftIngredient, ImportedRecipeDraft, NormaliserStrategy } from '@hame/shared'
import { Button } from '@/components/ui/button'

const STRATEGY_LABEL: Record<NormaliserStrategy, string> = {
  BASIC: 'Basic parser',
  DICTIONARY: 'Dictionary',
  LLM: 'Language model',
}

/** Render an ingredient's normalised target as "qty unit name". */
function describe(ing: DraftIngredient): string {
  const parts = [ing.quantity != null ? String(ing.quantity) : '', ing.unit ?? '', ing.itemName]
  return parts.filter(Boolean).join(' ')
}

/**
 * Review step shown after a URL import (spec §10 Phase 4.5). Surfaces the
 * normalisation strategy that ran, any fallback warnings, and a before/after of
 * each ingredient line, so the user confirms the cleaned-up data before it
 * seeds the editable recipe form.
 */
export function NormalisationReview({
  draft,
  onAccept,
  onDiscard,
}: {
  draft: ImportedRecipeDraft
  onAccept: () => void
  onDiscard: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Imported <span className="font-medium text-ink">{draft.title}</span> — review the cleaned
          ingredients below.
        </p>
        <span className="shrink-0 rounded-pill border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {STRATEGY_LABEL[draft.normaliser]}
        </span>
      </div>

      {draft.warnings.length > 0 && (
        <div className="flex flex-col gap-1 rounded-card border border-warning/40 bg-warning/10 p-3">
          {draft.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
        {draft.ingredients.map((ing, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={ing.raw}>
              {ing.raw}
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 font-medium text-ink">{describe(ing)}</span>
            <span className="flex shrink-0 gap-1">
              {ing.isStaple && (
                <span className="rounded-pill bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  staple
                </span>
              )}
              {ing.baseUnit && (
                <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-xs text-accent">
                  {ing.baseUnit}
                </span>
              )}
              {ing.typicalUnitGrams != null && (
                <span className="rounded-pill bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  ≈{ing.typicalUnitGrams}g
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
        <Button type="button" onClick={onAccept}>
          Use these ingredients
        </Button>
      </div>
    </div>
  )
}
