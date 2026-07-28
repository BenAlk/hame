import { useId, useMemo, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import type { Tag } from '@hame/shared'
import { TagChip } from '@/components/features/tag-chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/api/client'
import { useSuggestTags } from '@/api/items'
import { useCreateTag, useTags } from '@/api/tags'
import {
  canCreateTag,
  filterTagPool,
  findTagByName,
  suggestionNote,
  unappliedSuggestions,
} from '@/lib/item-tags'

interface ItemTagsEditorProps {
  /** The tags currently on the item. */
  value: Tag[]
  /**
   * The replacement set. `tagIds` on the API **replaces** rather than merges, so
   * this is always the whole set — persisting it is the caller's business, which
   * is what lets the same control edit a saved item and stage tags for one that
   * doesn't exist yet.
   */
  onChange: (next: Tag[]) => void
  /**
   * The item's name, which is what suggestions are reasoned from. `suggest-tags`
   * takes a name rather than an id precisely so this works mid-typing, before
   * there is anything to look up (spec §10 Phase 16).
   */
  itemName: string
  /** Ties the caller's own `<label>` to the tag input. */
  inputId: string
  disabled?: boolean
}

/**
 * Edit an item's tags (spec §12 LLM auto-tagging).
 *
 * Item tags do three jobs beyond description — they section the shopping list by
 * aisle (§8.3), hint the pantry's storage location, and `quick-add` drives the
 * shopping quick-add dropdown (§8.2) — so this is a genuinely load-bearing
 * surface rather than decoration.
 *
 * Suggestions are **offered, not applied**: the model's picks arrive as dashed
 * chips that take a tap to accept, the same "suggest and match, never
 * auto-create" stance Phase 16 took with barcode names. Nothing the model says
 * changes an item on its own.
 */
export function ItemTagsEditor({
  value,
  onChange,
  itemName,
  inputId,
  disabled,
}: ItemTagsEditorProps) {
  const { data: tags } = useTags()
  const createTag = useCreateTag()
  const suggest = useSuggestTags()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [suggested, setSuggested] = useState<Tag[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listId = useId()

  const pool = tags ?? []
  const matches = useMemo(() => filterTagPool(pool, value, query), [pool, value, query])
  const offerCreate = canCreateTag(pool, query)
  const busy = disabled || createTag.isPending

  function add(tag: Tag) {
    setQuery('')
    setOpen(false)
    setError(null)
    setSuggested((current) => current.filter((t) => t.id !== tag.id))
    if (!value.some((t) => t.id === tag.id)) onChange([...value, tag])
  }

  async function onCreate() {
    const name = query.trim()
    if (!name) return
    setError(null)
    // Someone may have added this tag since the pool was cached — apply theirs
    // rather than colliding on the unique name.
    const existing = findTagByName(pool, name)
    if (existing) {
      add(existing)
      return
    }
    try {
      add(await createTag.mutateAsync({ name }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create that tag.')
    }
  }

  async function onSuggest() {
    const name = itemName.trim()
    if (!name) return
    setError(null)
    setNote(null)
    try {
      const result = await suggest.mutateAsync({ name })
      const fresh = unappliedSuggestions(result.tags, value)
      setSuggested(fresh)
      setNote(suggestionNote(result, { poolEmpty: pool.length === 0, freshCount: fresh.length }))
    } catch (err) {
      setSuggested([])
      setError(err instanceof ApiError ? err.message : 'Could not reach the suggestion service.')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              className="px-2.5 py-1 text-xs"
              onRemove={() => {
                if (!busy) onChange(value.filter((t) => t.id !== tag.id))
              }}
            />
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          id={inputId}
          value={query}
          disabled={busy}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          placeholder={value.length > 0 ? 'Add another tag…' : 'Add a tag…'}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            // Enter inside a wider form must commit a tag, never submit the form.
            e.preventDefault()
            if (matches.length > 0) add(matches[0])
            else if (offerCreate) void onCreate()
          }}
        />

        {open && (matches.length > 0 || offerCreate) && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-control border border-line bg-surface py-1 shadow-ambient"
          >
            {matches.slice(0, 8).map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  // Keep focus on the input so the blur-close doesn't beat the click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(tag)}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-ink hover:bg-muted"
                >
                  {tag.name}
                </button>
              </li>
            ))}
            {offerCreate && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void onCreate()}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-accent hover:bg-muted"
                >
                  <Plus className="size-3.5 shrink-0" />
                  <span className="truncate">Create “{query.trim()}”</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || suggest.isPending || itemName.trim() === ''}
          onClick={() => void onSuggest()}
        >
          <Sparkles className="size-3.5" />
          {suggest.isPending ? 'Thinking…' : 'Suggest tags'}
        </Button>

        {/* Dashed = offered but not applied (design §6), and a leading + says
            "tap to add" without relying on the border alone to carry it. */}
        {suggested.map((tag) => (
          <button
            key={tag.id}
            type="button"
            disabled={busy}
            onClick={() => add(tag)}
            className="inline-flex items-center gap-1 rounded-pill border border-dashed border-accent px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
          >
            <Plus className="size-3" />
            {tag.name}
          </button>
        ))}
      </div>

      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {error && <p className="text-xs text-warning">{error}</p>}
    </div>
  )
}
