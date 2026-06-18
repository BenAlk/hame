import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ArchiveShoppingListResult, ShoppingList } from '@hame/shared'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/api/client'
import { useArchiveShoppingList } from '@/api/shopping'
import { useStorageLocations } from '@/api/storage-locations'
import { quantityLabel } from '@/lib/format'

interface ArchiveDialogProps {
  list: ShoppingList
  open: boolean
  onClose: () => void
  onArchived: (result: ArchiveShoppingListResult) => void
}

/** Per-bought-item pantry choice. */
interface PantryChoice {
  add: boolean
  locationId: string
  expiryDate: string
}

/**
 * The archive flow (spec §8.3): ticked items can be stocked into the pantry
 * (location + optional expiry); unticked items can roll over to a new list.
 */
export function ArchiveDialog({ list, open, onClose, onArchived }: ArchiveDialogProps) {
  const { data: locations } = useStorageLocations()
  const archive = useArchiveShoppingList()
  const [error, setError] = useState<string | null>(null)

  const bought = useMemo(() => list.items.filter((i) => i.isBought), [list.items])
  const unbought = useMemo(() => list.items.filter((i) => !i.isBought), [list.items])
  const defaultLocation = locations?.[0]?.id ?? ''

  // Local per-item state, seeded once the dialog opens with data.
  const [pantry, setPantry] = useState<Record<string, PantryChoice>>({})
  const [rollover, setRollover] = useState<Record<string, boolean>>({})
  const [newListName, setNewListName] = useState('')
  const [seeded, setSeeded] = useState(false)

  if (open && !seeded) {
    setPantry(
      Object.fromEntries(
        bought.map((i) => [i.id, { add: true, locationId: defaultLocation, expiryDate: '' }]),
      ),
    )
    setRollover(Object.fromEntries(unbought.map((i) => [i.id, true])))
    setNewListName(`${list.name} (continued)`)
    setSeeded(true)
  }

  function close() {
    setSeeded(false)
    setError(null)
    onClose()
  }

  const rolloverIds = unbought.filter((i) => rollover[i.id]).map((i) => i.id)
  const pantryToAdd = bought.filter((i) => pantry[i.id]?.add)
  const missingLocation = pantryToAdd.some((i) => !pantry[i.id]?.locationId)

  async function onConfirm() {
    setError(null)
    if (missingLocation) {
      setError('Choose a storage location for each item going to the pantry.')
      return
    }
    try {
      const result = await archive.mutateAsync({
        id: list.id,
        pantryEntries: pantryToAdd.map((i) => ({
          shoppingItemId: i.id,
          locationId: pantry[i.id].locationId,
          expiryDate: pantry[i.id].expiryDate ? new Date(pantry[i.id].expiryDate) : null,
        })),
        rolloverItemIds: rolloverIds,
        newListName: rolloverIds.length > 0 ? newListName : undefined,
      })
      close()
      onArchived(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not archive the list.')
    }
  }

  return (
    <Modal open={open} onClose={close} title={`Archive “${list.name}”`}>
      <div className="flex flex-col gap-6">
        {/* Bought → pantry */}
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Add to pantry
          </h3>
          {bought.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items were ticked off.</p>
          ) : !locations || locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No storage locations yet —{' '}
              <Link to="/pantry" className="text-accent hover:underline">
                add one in the pantry
              </Link>{' '}
              to stock bought items.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {bought.map((row) => {
                const choice = pantry[row.id] ?? {
                  add: false,
                  locationId: defaultLocation,
                  expiryDate: '',
                }
                return (
                  <li key={row.id} className="rounded-inner border border-line p-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-ink">
                      <input
                        type="checkbox"
                        checked={choice.add}
                        onChange={(e) =>
                          setPantry((p) => ({
                            ...p,
                            [row.id]: { ...choice, add: e.target.checked },
                          }))
                        }
                      />
                      {row.item.name}
                      <span className="text-xs font-normal text-muted-foreground">
                        {quantityLabel(row.quantity, row.unit)}
                      </span>
                    </label>
                    {choice.add && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-6">
                        <select
                          aria-label={`Location for ${row.item.name}`}
                          value={choice.locationId}
                          onChange={(e) =>
                            setPantry((p) => ({
                              ...p,
                              [row.id]: { ...choice, locationId: e.target.value },
                            }))
                          }
                          className="h-9 rounded-control border border-input bg-surface px-2 text-sm text-ink"
                        >
                          {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="date"
                          aria-label={`Expiry for ${row.item.name}`}
                          value={choice.expiryDate}
                          onChange={(e) =>
                            setPantry((p) => ({
                              ...p,
                              [row.id]: { ...choice, expiryDate: e.target.value },
                            }))
                          }
                          className="h-9 w-40"
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Unbought → rollover */}
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Roll over to a new list
          </h3>
          {unbought.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everything was bought.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {unbought.map((row) => (
                <li key={row.id}>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={rollover[row.id] ?? false}
                      onChange={(e) => setRollover((r) => ({ ...r, [row.id]: e.target.checked }))}
                    />
                    {row.item.name}
                    <span className="text-xs text-muted-foreground">
                      {quantityLabel(row.quantity, row.unit)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {rolloverIds.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="new-list-name">New list name</Label>
              <Input
                id="new-list-name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
            </div>
          )}
        </section>

        {error && <p className="text-sm text-warning">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={archive.isPending}>
            {archive.isPending ? 'Archiving…' : 'Archive list'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
