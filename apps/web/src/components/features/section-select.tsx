import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/api/client'
import { useSuggestSection } from '@/api/items'
import { useSections } from '@/api/sections'
import { sectionSuggestionNote } from '@/lib/item-sections'

/**
 * Pick which part of the shop an item is in (spec §8.3). Single-choice, because
 * an item is in exactly one section — the reason this is a field and not a tag.
 *
 * Options list in walking order rather than alphabetically, so the picker reads
 * the same way the shopping list will.
 *
 * Given an `itemName`, it can also ask the model to place the item. The answer is
 * **offered as a chip, not selected for you** — the same stance as tag suggestion
 * and barcode matching: the model narrows the choice, it never makes it.
 */
export function SectionSelect({
  id,
  value,
  onChange,
  disabled,
  itemName,
}: {
  id: string
  value: string | null
  onChange: (sectionId: string | null) => void
  disabled?: boolean
  /** Enables the suggest affordance. Suggestion needs a name to reason from. */
  itemName?: string
}) {
  const { data: sections } = useSections()
  const suggest = useSuggestSection()
  const [suggested, setSuggested] = useState<{ id: string; name: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pool = sections ?? []
  const canSuggest = itemName !== undefined && itemName.trim() !== ''

  async function onSuggest() {
    if (!canSuggest) return
    setError(null)
    setNote(null)
    setSuggested(null)
    try {
      const result = await suggest.mutateAsync({ name: itemName.trim() })
      const note = sectionSuggestionNote(result, {
        poolEmpty: pool.length === 0,
        currentSectionId: value,
      })
      setNote(note)
      // Only worth a chip when it would actually change the filing.
      if (result.section && note === null) setSuggested(result.section)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the suggestion service.')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => {
          setSuggested(null)
          setNote(null)
          onChange(e.target.value || null)
        }}
        className="h-10 w-full rounded-control border border-input bg-surface px-2 text-sm text-ink"
      >
        <option value="">No section — groups under “Other”</option>
        {pool.map((section) => (
          <option key={section.id} value={section.id}>
            {section.name}
          </option>
        ))}
      </select>

      {itemName !== undefined && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || suggest.isPending || !canSuggest}
            onClick={() => void onSuggest()}
          >
            <Sparkles className="size-3.5" />
            {suggest.isPending ? 'Thinking…' : 'Suggest section'}
          </Button>

          {/* Dashed = offered but not applied (design §6); the + says "tap to
              use" without leaning on the border alone to carry it. */}
          {suggested && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(suggested.id)
                setSuggested(null)
              }}
              className="inline-flex items-center gap-1 rounded-pill border border-dashed border-accent px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus className="size-3" />
              {suggested.name}
            </button>
          )}
        </div>
      )}

      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {error && <p className="text-xs text-warning">{error}</p>}
    </div>
  )
}
