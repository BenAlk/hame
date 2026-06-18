import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { PantryEntry, PublicUser } from '@hame/shared'
import { AppNav } from '@/components/app-nav'
import { WidgetCard } from '@/components/features/widget-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/api/client'
import { useCurrentUser } from '@/api/auth'
import { useItems } from '@/api/items'
import { useCreatePantryEntry, useDeletePantryEntry, usePantry } from '@/api/pantry'
import {
  useCreateStorageLocation,
  useDeleteStorageLocation,
  useStorageLocations,
} from '@/api/storage-locations'
import { cn } from '@/lib/utils'
import { isOverdueOrToday, quantityLabel, relativeDay } from '@/lib/format'

export function PantryPage() {
  const { data: me } = useCurrentUser()
  const { data: locations } = useStorageLocations()
  const { data: entries, isPending } = usePantry()

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
        <AppNav user={(me as PublicUser | null) ?? null} />
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
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </div>
              </WidgetCard>
            ))
          )}
        </div>

        <LocationsPanel />
      </div>
    </main>
  )
}

function EntryRow({ entry }: { entry: PantryEntry }) {
  const removeEntry = useDeletePantryEntry()
  const urgent = entry.expiryDate ? isOverdueOrToday(entry.expiryDate) : false
  return (
    <div className="group flex items-center gap-3 py-2 text-sm">
      <span
        aria-hidden
        title={`Added by ${entry.addedBy.firstName}`}
        className="inline-block size-2.5 shrink-0 rounded-pill"
        style={{ backgroundColor: entry.addedBy.colour }}
      />
      <span className="min-w-0 flex-1 truncate text-ink">{entry.item.name}</span>
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
      <button
        type="button"
        onClick={() => void removeEntry.mutateAsync(entry.id)}
        aria-label={`Remove ${entry.item.name}`}
        className="shrink-0 rounded-control p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
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
        />
        <Button type="submit" size="sm" disabled={createLocation.isPending}>
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
