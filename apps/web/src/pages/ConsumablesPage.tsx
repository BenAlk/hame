import { useState } from 'react'
import { RotateCw, X } from 'lucide-react'
import type { Consumable } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/api/client'
import {
  useConsumables,
  useRemoveConsumable,
  useSetConsumable,
  useUpdateConsumable,
} from '@/api/consumables'
import { relativeDay } from '@/lib/format'

/**
 * Consumables (spec §8.3): the curated household re-order checklist — the
 * non-perishable, non-recipe goods (loo roll, foil, dishwasher tabs) that fall
 * through the pantry/recipe cracks. Adding by name flags the item; removing just
 * unflags it (the item and its history survive).
 */
export function ConsumablesPage() {
  const { data: consumables, isPending } = useConsumables()
  const setConsumable = useSetConsumable()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    setError(null)
    try {
      await setConsumable.mutateAsync({ itemName: name })
      setDraft('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that consumable.')
    }
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl font-medium text-ink">Consumables</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Household goods you re-order rather than cook with — loo roll, foil, dishwasher tabs. Tick
          them onto a shopping list from the Shopping page or when generating from a meal plan.
        </p>
      </header>

      <form onSubmit={onAdd} className="flex max-w-md gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a consumable…"
          aria-label="Add a consumable"
          className="min-w-0"
        />
        <Button type="submit" className="shrink-0" disabled={setConsumable.isPending}>
          Add
        </Button>
      </form>
      {error && <p className="text-sm text-warning">{error}</p>}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : consumables && consumables.length > 0 ? (
        <ul className="grid max-w-2xl gap-2">
          {consumables.map((c) => (
            <ConsumableRow key={c.id} consumable={c} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No consumables yet. Add the things you buy on repeat.
        </p>
      )}
    </main>
  )
}

/** One consumable: name, live last-bought hint, editable re-order cadence, remove. */
function ConsumableRow({ consumable }: { consumable: Consumable }) {
  const updateConsumable = useUpdateConsumable()
  const removeConsumable = useRemoveConsumable()
  const [interval, setInterval] = useState(
    consumable.reorderIntervalDays == null ? '' : String(consumable.reorderIntervalDays),
  )

  function commitInterval() {
    const trimmed = interval.trim()
    const next = trimmed === '' ? null : Number(trimmed)
    if (next !== null && (!Number.isInteger(next) || next <= 0)) return
    if (next === consumable.reorderIntervalDays) return
    void updateConsumable.mutateAsync({ itemId: consumable.id, reorderIntervalDays: next })
  }

  return (
    <li className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{consumable.name}</p>
        <p className="text-xs text-muted-foreground">
          {consumable.lastBoughtAt
            ? `Last bought ${relativeDay(consumable.lastBoughtAt).toLowerCase()}`
            : 'Not bought yet'}
        </p>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <RotateCw className="size-3.5" aria-hidden />
        every
        <Input
          type="number"
          min={1}
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          onBlur={commitInterval}
          placeholder="—"
          aria-label={`Re-order cadence in days for ${consumable.name}`}
          className="h-8 w-16 text-center"
        />
        days
      </label>

      <button
        type="button"
        onClick={() => void removeConsumable.mutateAsync(consumable.id)}
        aria-label={`Remove ${consumable.name} from consumables`}
        className="shrink-0 rounded-control p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </li>
  )
}
