import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import type { GenerateShoppingListResult } from '@hame/shared'
import { isConsumableDue } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DueChip } from '@/components/features/shopping/due-chip'
import { ApiError } from '@/api/client'
import { useGenerateShoppingList, usePreviewShoppingList } from '@/api/meal-plans'
import { useShoppingLists } from '@/api/shopping'
import { useConsumables } from '@/api/consumables'
import { quantityLabel, relativeDay } from '@/lib/format'

interface GenerateListDialogProps {
  /** Default range (the week being viewed), ISO yyyy-mm-dd. */
  defaultStart: string
  defaultEnd: string
  onClose: () => void
}

/**
 * The "Generate shopping list" flow (spec §8.6). Two panels: a read-only preview
 * of the food shortfall (dry-run, nothing written) on the left and the
 * consumables checklist on the right. Confirming folds both into a target list —
 * a freshly named one, or the current active list when the name is left blank —
 * recomputing the food quantities server-side.
 */
export function GenerateListDialog({ defaultStart, defaultEnd, onClose }: GenerateListDialogProps) {
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)
  const [name, setName] = useState('')
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateShoppingListResult | null>(null)

  const preview = usePreviewShoppingList()
  const generate = useGenerateShoppingList()
  const { data: consumables } = useConsumables()
  // Active lists come back most-recently-updated first — the same list the
  // server folds into when no name is given (meal-plan.service resolveTargetList).
  const { data: activeLists } = useShoppingLists('ACTIVE')
  const currentList = activeLists?.[0]

  // Re-run the dry-run whenever the range changes so the preview stays in step.
  const previewMutate = preview.mutate
  useEffect(() => {
    if (!start || !end || end < start) return
    previewMutate({ startDate: new Date(start), endDate: new Date(end) })
  }, [start, end, previewMutate])

  // Pre-tick the consumables that look due, once, when they first load (spec §12).
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !consumables) return
    seeded.current = true
    const due = consumables.filter((c) => isConsumableDue(c)).map((c) => c.id)
    if (due.length > 0) setTicked(new Set(due))
  }, [consumables])

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleGenerate() {
    setError(null)
    try {
      setResult(
        await generate.mutateAsync({
          startDate: new Date(start),
          endDate: new Date(end),
          listName: name.trim() || undefined,
          consumableItemIds: [...ticked],
        }),
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the list.')
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        {result.list ? (
          <>
            <p className="text-sm text-ink">
              Added to <span className="font-medium">{result.list.name}</span> — now{' '}
              {result.list.items.length} item{result.list.items.length === 1 ? '' : 's'} after
              checking the pantry.
            </p>
            <Link
              to="/shopping"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <ShoppingCart className="size-4" />
              Open it in Shopping
            </Link>
          </>
        ) : (
          <p className="text-sm text-ink">
            Nothing to add — the pantry already covers everything planned, and no consumables were
            ticked.
          </p>
        )}

        {result.warnings.length > 0 && (
          <div className="rounded-control border border-line bg-accent-soft/40 p-3 text-sm">
            <p className="font-medium text-ink">
              Couldn&apos;t total these (check units manually):
            </p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  const previewLines = preview.data?.lines ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gen-start">From</Label>
          <Input
            id="gen-start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gen-end">To</Label>
          <Input id="gen-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: read-only food shortfall preview */}
        <section className="flex min-w-0 flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            From your meal plan
          </h3>
          <div className="min-h-[6rem] rounded-control border border-line p-3">
            {preview.isPending ? (
              <p className="text-sm text-muted-foreground">Checking the plan…</p>
            ) : previewLines.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {previewLines.map((line) => (
                  <li key={line.itemId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-ink">{line.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {quantityLabel(line.quantity, line.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing short — the pantry covers everything planned.
              </p>
            )}
          </div>
          {preview.data && preview.data.warnings.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Couldn&apos;t total: {preview.data.warnings.join(', ')}
            </p>
          )}
        </section>

        {/* Right: consumables checklist */}
        <section className="flex min-w-0 flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Consumables
          </h3>
          <div className="min-h-[6rem] rounded-control border border-line p-3">
            {consumables && consumables.length > 0 ? (
              <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {consumables.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 py-1">
                      <input
                        type="checkbox"
                        checked={ticked.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="size-4 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                      {isConsumableDue(c) && <DueChip />}
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.lastBoughtAt ? relativeDay(c.lastBoughtAt).toLowerCase() : '—'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No consumables yet — add some on the Consumables page.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gen-name">List name (optional)</Label>
        <Input
          id="gen-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            currentList
              ? `Leave blank to add to “${currentList.name}”`
              : 'Leave blank to create a new list'
          }
        />
      </div>

      {error && <p className="text-sm text-warning">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleGenerate()} disabled={generate.isPending}>
          <ShoppingCart className="size-4" />
          {generate.isPending ? 'Adding…' : 'Add to shopping list'}
        </Button>
      </div>
    </div>
  )
}
