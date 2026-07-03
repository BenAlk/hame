import { useState } from 'react'
import { ChevronDown, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useConsumables } from '@/api/consumables'
import { useAddConsumablesToList } from '@/api/shopping'
import { relativeDay } from '@/lib/format'

/**
 * Always-available "Add consumables" checklist on the Shopping page (spec §8.3):
 * tick household re-order goods and fold them onto the active list in one go.
 * Each carries the same "last bought N days ago" hint as the Consumables page.
 */
export function AddConsumablesPanel({ listId }: { listId: string }) {
  const { data: consumables } = useConsumables()
  const addConsumables = useAddConsumablesToList(listId)
  const [open, setOpen] = useState(false)
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  if (!consumables || consumables.length === 0) return null

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onAdd() {
    if (ticked.size === 0) return
    await addConsumables.mutateAsync([...ticked])
    setTicked(new Set())
    setOpen(false)
  }

  return (
    <div className="mb-4 rounded-card border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-card px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-muted"
      >
        <Repeat className="size-4 text-muted-foreground" aria-hidden />
        Add consumables
        <ChevronDown
          className={cn(
            'ml-auto size-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-line p-3">
          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {consumables.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={ticked.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="size-4 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.lastBoughtAt ? relativeDay(c.lastBoughtAt).toLowerCase() : 'not bought yet'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void onAdd()}
              disabled={ticked.size === 0 || addConsumables.isPending}
            >
              Add {ticked.size > 0 ? `${ticked.size} ` : ''}to list
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
