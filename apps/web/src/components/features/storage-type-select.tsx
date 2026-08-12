import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import type { StorageType } from '@hame/shared'
import { STORAGE_TYPES, STORAGE_TYPE_LABELS } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/api/client'
import { useSuggestStorageType } from '@/api/items'
import { storageSuggestionNote } from '@/lib/storage-types'

/**
 * Pick how an item is kept (spec §10 Phase 25). Single-choice, because exactly one
 * applies — the reason this is a field and not the four tags it replaced.
 *
 * The options are a project constant rather than the household's rows, so unlike
 * {@link SectionSelect} there is no empty-pool case: the list is the same on every
 * install and can never be empty.
 *
 * Given an `itemName` it can ask the model. The answer is **offered as a chip, not
 * selected for you** — a select already shows a value, so choosing would be a
 * silent edit, the same stance sections and tags take.
 */
export function StorageTypeSelect({
  id,
  value,
  onChange,
  disabled,
  itemName,
}: {
  id: string
  value: StorageType | null
  onChange: (storageType: StorageType | null) => void
  disabled?: boolean
  /** Enables the suggest affordance. Suggestion needs a name to reason from. */
  itemName?: string
}) {
  const suggest = useSuggestStorageType()
  const [suggested, setSuggested] = useState<StorageType | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSuggest = itemName !== undefined && itemName.trim() !== ''

  async function onSuggest() {
    if (!canSuggest) return
    setError(null)
    setNote(null)
    setSuggested(null)
    try {
      const result = await suggest.mutateAsync({ name: itemName.trim() })
      const note = storageSuggestionNote(result, { current: value })
      setNote(note)
      // Only worth a chip when it would actually change the answer.
      if (result.storageType && note === null) setSuggested(result.storageType)
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
          onChange((e.target.value || null) as StorageType | null)
        }}
        className="h-10 w-full rounded-control border border-input bg-surface px-2 text-sm text-ink"
      >
        <option value="">Not set — no default location</option>
        {STORAGE_TYPES.map((type) => (
          <option key={type} value={type}>
            {STORAGE_TYPE_LABELS[type].label} — {STORAGE_TYPE_LABELS[type].description}
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
            {suggest.isPending ? 'Thinking…' : 'Suggest storage'}
          </Button>

          {/* Dashed = offered but not applied (design §6). */}
          {suggested && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(suggested)
                setSuggested(null)
              }}
              className="inline-flex items-center gap-1 rounded-pill border border-dashed border-accent px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus className="size-3" />
              {STORAGE_TYPE_LABELS[suggested].label}
            </button>
          )}
        </div>
      )}

      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {error && <p className="text-xs text-warning">{error}</p>}
    </div>
  )
}
