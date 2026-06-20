import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import type { GenerateShoppingListResult } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/api/client'
import { useGenerateShoppingList } from '@/api/meal-plans'

interface GenerateListDialogProps {
  /** Default range (the week being viewed), ISO yyyy-mm-dd. */
  defaultStart: string
  defaultEnd: string
  onClose: () => void
}

/**
 * The "Generate shopping list for this week" flow (spec §8.6): pick a range,
 * the backend sums the planned recipes against the pantry and creates a list.
 */
export function GenerateListDialog({ defaultStart, defaultEnd, onClose }: GenerateListDialogProps) {
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateShoppingListResult | null>(null)
  const generate = useGenerateShoppingList()

  async function handleGenerate() {
    setError(null)
    try {
      setResult(
        await generate.mutateAsync({
          startDate: new Date(start),
          endDate: new Date(end),
          listName: name.trim() || undefined,
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
              Created <span className="font-medium">{result.list.name}</span> with{' '}
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
            Nothing to buy — the pantry already covers everything planned for this range.
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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Adds up every planned recipe in the range, subtracts what&apos;s in the pantry, and creates
        a shopping list for the shortfall.
      </p>
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gen-name">List name (optional)</Label>
        <Input
          id="gen-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Defaults to the date range"
        />
      </div>

      {error && <p className="text-sm text-warning">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleGenerate()} disabled={generate.isPending}>
          <ShoppingCart className="size-4" />
          {generate.isPending ? 'Generating…' : 'Generate list'}
        </Button>
      </div>
    </div>
  )
}
