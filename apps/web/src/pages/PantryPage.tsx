import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ScanLine, Trash2 } from 'lucide-react'
import type { PantryEntry, Shop } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { ShopChip } from '@/components/features/shop-chip'
import { ScanDialog } from '@/components/features/pantry/scan-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/api/client'
import { useItems, useUpdateItem } from '@/api/items'
import { useCreatePantryEntry, useDeletePantryEntry, usePantry } from '@/api/pantry'
import { useCreateShop, useDeleteShop, useShops } from '@/api/shops'
import {
  useCreateStorageLocation,
  useDeleteStorageLocation,
  useStorageLocations,
} from '@/api/storage-locations'
import { cn } from '@/lib/utils'
import { isOverdueOrToday, quantityLabel, relativeDay } from '@/lib/format'

export function PantryPage() {
  const { data: locations } = useStorageLocations()
  const { data: entries, isPending } = usePantry()
  // Hold the id, not the row: editing the item from the modal refetches the
  // pantry, and a captured object would keep showing the pre-edit values.
  const [detailId, setDetailId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const detail = entries?.find((e) => e.id === detailId) ?? null

  const grouped = useMemo(() => {
    const map = new Map<string, PantryEntry[]>()
    for (const e of entries ?? []) {
      map.set(e.location.name, [...(map.get(e.location.name) ?? []), e])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [entries])

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Pantry</h1>
        <Button onClick={() => setScanning(true)}>
          <ScanLine className="size-4" />
          Scan shopping in
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          <AddEntryForm hasLocations={Boolean(locations && locations.length > 0)} />

          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your pantry is empty.</p>
          ) : (
            grouped.map(([location, rows]) => (
              <WidgetCard key={location} title={location} action={<span>{rows.length}</span>}>
                <div className="divide-y divide-line">
                  {rows.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onOpen={() => setDetailId(entry.id)} />
                  ))}
                </div>
              </WidgetCard>
            ))
          )}
        </div>

        <div className="flex flex-col gap-6">
          <LocationsPanel />
          <ShopsPanel />
        </div>
      </div>

      <EntryDetailModal entry={detail} onClose={() => setDetailId(null)} />
      <ScanDialog open={scanning} onClose={() => setScanning(false)} />
    </main>
  )
}

function EntryRow({ entry, onOpen }: { entry: PantryEntry; onOpen: () => void }) {
  const urgent = entry.expiryDate ? isOverdueOrToday(entry.expiryDate) : false
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-2 text-left text-sm transition-colors hover:bg-muted"
    >
      <span
        aria-hidden
        title={`Added by ${entry.addedBy.firstName}`}
        className="inline-block size-2.5 shrink-0 rounded-pill"
        style={{ backgroundColor: entry.addedBy.colour }}
      />
      <span className="min-w-0 flex-1 truncate text-ink">{entry.item.name}</span>
      {entry.item.shop && <ShopChip shop={entry.item.shop} />}
      <span className="shrink-0 text-xs text-muted-foreground">
        {quantityLabel(entry.quantity, entry.unit)}
      </span>
      {entry.expiryDate && (
        <span
          className={cn(
            'shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium',
            urgent
              ? 'bg-warning text-[var(--destructive-foreground)]'
              : 'bg-accent-soft text-accent',
          )}
        >
          {relativeDay(entry.expiryDate)}
        </span>
      )}
    </button>
  )
}

/** Detail view for a single pantry instance — quantity, location and crucially its use-by date. */
function EntryDetailModal({ entry, onClose }: { entry: PantryEntry | null; onClose: () => void }) {
  const removeEntry = useDeletePantryEntry()
  const { data: shops } = useShops()
  const updateItem = useUpdateItem()
  const urgent = entry?.expiryDate ? isOverdueOrToday(entry.expiryDate) : false

  async function onRemove() {
    if (!entry) return
    await removeEntry.mutateAsync(entry.id)
    onClose()
  }

  return (
    <Modal open={entry !== null} onClose={onClose} title={entry?.item.name ?? ''}>
      {entry && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Quantity</dt>
            <dd className="text-ink">{quantityLabel(entry.quantity, entry.unit) || '—'}</dd>

            <dt className="text-muted-foreground">Location</dt>
            <dd className="text-ink">{entry.location.name}</dd>

            <dt className="text-muted-foreground">
              <label htmlFor="entry-shop">Shop</label>
            </dt>
            <dd>
              {/* Set on the Item, not this jar — "only buyable at Lidl" is a
                  property of the product (spec §8.3). */}
              <select
                id="entry-shop"
                value={entry.item.shop?.id ?? ''}
                disabled={updateItem.isPending}
                onChange={(e) =>
                  void updateItem.mutateAsync({
                    id: entry.item.id,
                    shopId: e.target.value || null,
                  })
                }
                className="h-10 w-full rounded-control border border-input bg-surface px-2 text-sm text-ink"
              >
                <option value="">Any shop</option>
                {shops?.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    Only at {shop.name}
                  </option>
                ))}
              </select>
            </dd>

            <dt className="text-muted-foreground">Expiry</dt>
            <dd className={cn(urgent ? 'font-medium text-warning' : 'text-ink')}>
              {entry.expiryDate
                ? `${format(entry.expiryDate, 'd MMM yyyy')} · ${relativeDay(entry.expiryDate)}`
                : 'No use-by date'}
            </dd>

            <dt className="text-muted-foreground">Added by</dt>
            <dd className="flex items-center gap-2 text-ink">
              <span
                aria-hidden
                className="inline-block size-2.5 shrink-0 rounded-pill"
                style={{ backgroundColor: entry.addedBy.colour }}
              />
              {entry.addedBy.firstName}
            </dd>

            <dt className="text-muted-foreground">Added</dt>
            <dd className="text-ink">{format(entry.addedAt, 'd MMM yyyy')}</dd>
          </dl>

          <div className="flex justify-end border-t border-line pt-4">
            <Button
              variant="destructive"
              size="sm"
              disabled={removeEntry.isPending}
              onClick={() => void onRemove()}
            >
              <Trash2 className="size-4" />
              {removeEntry.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function AddEntryForm({ hasLocations }: { hasLocations: boolean }) {
  const { data: items } = useItems()
  const { data: locations } = useStorageLocations()
  const createEntry = useCreatePantryEntry()
  const [name, setName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('')
  const [expiry, setExpiry] = useState('')
  const [error, setError] = useState<string | null>(null)

  const resolvedLocation = locationId || locations?.[0]?.id || ''

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const qty = Number(quantity)
    if (!name.trim() || !resolvedLocation || !Number.isFinite(qty) || qty <= 0) {
      setError('Enter an item, a location and a quantity above zero.')
      return
    }
    try {
      await createEntry.mutateAsync({
        itemName: name.trim(),
        locationId: resolvedLocation,
        quantity: qty,
        unit: unit.trim() || null,
        expiryDate: expiry ? new Date(expiry) : null,
      })
      setName('')
      setQuantity('1')
      setUnit('')
      setExpiry('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add to pantry.')
    }
  }

  if (!hasLocations) {
    return (
      <WidgetCard title="Add stock">
        <p className="text-sm text-muted-foreground">
          Add a storage location first, then you can stock items here.
        </p>
      </WidgetCard>
    )
  }

  return (
    <WidgetCard title="Add stock">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <Label htmlFor="entry-name">Item</Label>
          <Input
            id="entry-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Milk"
            list="pantry-items"
          />
          <datalist id="pantry-items">
            {items?.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
        </div>
        <div className="flex w-24 flex-col gap-1.5">
          <Label htmlFor="entry-qty">Qty</Label>
          <Input
            id="entry-qty"
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="flex w-24 flex-col gap-1.5">
          <Label htmlFor="entry-unit">Unit</Label>
          <Input
            id="entry-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="g, ml…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-location">Location</Label>
          <select
            id="entry-location"
            value={resolvedLocation}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-10 rounded-control border border-input bg-surface px-2 text-sm text-ink"
          >
            {locations?.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-expiry">Expiry</Label>
          <Input
            id="entry-expiry"
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-40"
          />
        </div>
        <Button type="submit" disabled={createEntry.isPending}>
          Add
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-warning">{error}</p>}
    </WidgetCard>
  )
}

/**
 * Shops an item can be exclusive to (spec §8.3). Deleting one is deliberately
 * allowed even while items reference it — the FK is `SetNull`, so they fall back
 * to "buy anywhere" — hence the confirm naming what will happen.
 */
function ShopsPanel() {
  const { data: shops } = useShops()
  const { data: items } = useItems()
  const createShop = useCreateShop()
  const deleteShop = useDeleteShop()
  const [name, setName] = useState('')
  const [colour, setColour] = useState('#6f8169')
  const [pendingDelete, setPendingDelete] = useState<Shop | null>(null)
  const [error, setError] = useState<string | null>(null)

  const affected = items?.filter((i) => i.shop?.id === pendingDelete?.id).length ?? 0

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    try {
      await createShop.mutateAsync({ name: name.trim(), colour })
      setName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add shop.')
    }
  }

  async function onDelete() {
    if (!pendingDelete) return
    setError(null)
    try {
      await deleteShop.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove shop.')
    }
  }

  return (
    <WidgetCard title="Shops">
      <form onSubmit={onAdd} className="mb-3 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lidl"
          aria-label="New shop name"
          className="min-w-0"
        />
        <input
          type="color"
          value={colour}
          onChange={(e) => setColour(e.target.value)}
          aria-label="Shop colour"
          className="h-10 w-10 shrink-0 cursor-pointer rounded-control border border-input bg-surface p-1"
        />
        <Button type="submit" className="shrink-0" disabled={createShop.isPending}>
          Add
        </Button>
      </form>
      {error && <p className="mb-2 text-sm text-warning">{error}</p>}
      <ul className="flex flex-col gap-1">
        {shops?.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No shops yet. Add one to mark items that are only buyable in a single place.
          </li>
        )}
        {shops?.map((shop) => (
          <li
            key={shop.id}
            className="group flex items-center justify-between rounded-control px-2 py-1.5 text-sm hover:bg-muted"
          >
            <ShopChip shop={shop} />
            <button
              type="button"
              onClick={() => setPendingDelete(shop)}
              aria-label={`Remove ${shop.name}`}
              className="rounded-control p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove shop"
        pending={deleteShop.isPending}
        error={error}
        onConfirm={() => void onDelete()}
        onCancel={() => setPendingDelete(null)}
      >
        Remove <strong>{pendingDelete?.name}</strong>?{' '}
        {affected > 0
          ? `${affected} item${affected === 1 ? '' : 's'} will go back to "buy anywhere". Nothing is deleted.`
          : 'No items are using it.'}
      </ConfirmDialog>
    </WidgetCard>
  )
}

function LocationsPanel() {
  const { data: locations } = useStorageLocations()
  const createLocation = useCreateStorageLocation()
  const deleteLocation = useDeleteStorageLocation()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    try {
      await createLocation.mutateAsync({ name: name.trim() })
      setName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add location.')
    }
  }

  async function onDelete(id: string) {
    setError(null)
    try {
      await deleteLocation.mutateAsync(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove location.')
    }
  }

  return (
    <WidgetCard title="Storage locations">
      <form onSubmit={onAdd} className="mb-3 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Garage freezer"
          aria-label="New location name"
          className="min-w-0"
        />
        <Button type="submit" className="shrink-0" disabled={createLocation.isPending}>
          Add
        </Button>
      </form>
      {error && <p className="mb-2 text-sm text-warning">{error}</p>}
      <ul className="flex flex-col gap-1">
        {locations?.length === 0 && (
          <li className="text-sm text-muted-foreground">No locations yet.</li>
        )}
        {locations?.map((loc) => (
          <li
            key={loc.id}
            className="group flex items-center justify-between rounded-control px-2 py-1.5 text-sm hover:bg-muted"
          >
            <span className="text-ink">{loc.name}</span>
            <button
              type="button"
              onClick={() => void onDelete(loc.id)}
              aria-label={`Remove ${loc.name}`}
              className="rounded-control p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </WidgetCard>
  )
}
