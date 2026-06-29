import { useMemo, useState } from 'react'
import type { ShoppingList, ShoppingListItem } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckRow } from '@/components/features/shopping/check-row'
import { ArchiveDialog } from '@/components/features/shopping/archive-dialog'
import { ApiError } from '@/api/client'
import { useItems } from '@/api/items'
import {
  useAddShoppingItem,
  useCreateShoppingList,
  useDeleteShoppingList,
  useRemoveShoppingItem,
  useShoppingLists,
  useUpdateShoppingItem,
} from '@/api/shopping'

const UNTAGGED = 'Other'

/** Group a list's items by their first tag; bought items sink to the bottom. */
function groupByTag(items: ShoppingListItem[]): [string, ShoppingListItem[]][] {
  const groups = new Map<string, ShoppingListItem[]>()
  for (const item of items) {
    const key = item.item.tags[0]?.name ?? UNTAGGED
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  for (const list of groups.values()) {
    list.sort((a, b) => Number(a.isBought) - Number(b.isBought))
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === UNTAGGED ? 1 : b === UNTAGGED ? -1 : a.localeCompare(b),
  )
}

export function ShoppingPage() {
  const { data: lists, isPending } = useShoppingLists()
  const createList = useCreateShoppingList()
  const deleteList = useDeleteShoppingList()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const active = lists?.filter((l) => l.status === 'ACTIVE') ?? []
  const archived = lists?.filter((l) => l.status === 'ARCHIVED') ?? []
  const selected = lists?.find((l) => l.id === selectedId) ?? active[0] ?? archived[0] ?? null

  async function onCreateList(e: React.FormEvent) {
    e.preventDefault()
    if (!newListName.trim()) return
    const list = await createList.mutateAsync({ name: newListName.trim() })
    setNewListName('')
    setSelectedId(list.id)
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Shopping</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* List selector */}
        <aside className="flex min-w-0 flex-col gap-3">
          <form onSubmit={onCreateList} className="flex gap-2">
            <Input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New list…"
              aria-label="New list name"
              className="min-w-0"
            />
            <Button type="submit" className="shrink-0" disabled={createList.isPending}>
              Add
            </Button>
          </form>

          <nav className="flex flex-col gap-1">
            {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
            {active.map((list) => (
              <ListButton
                key={list.id}
                list={list}
                selected={list.id === selected?.id}
                onSelect={() => setSelectedId(list.id)}
              />
            ))}
            {archived.length > 0 && (
              <button
                onClick={() => setShowArchived((s) => !s)}
                className="mt-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
              </button>
            )}
            {showArchived &&
              archived.map((list) => (
                <ListButton
                  key={list.id}
                  list={list}
                  selected={list.id === selected?.id}
                  onSelect={() => setSelectedId(list.id)}
                />
              ))}
          </nav>
        </aside>

        {/* Selected list */}
        {selected ? (
          <ListDetail
            list={selected}
            onArchive={() => setArchiving(true)}
            onDelete={() => {
              void deleteList.mutateAsync(selected.id)
              setSelectedId(null)
            }}
          />
        ) : (
          <p className="text-muted-foreground">Create a list to get started.</p>
        )}
      </div>

      {selected && selected.status === 'ACTIVE' && (
        <ArchiveDialog
          list={selected}
          open={archiving}
          onClose={() => setArchiving(false)}
          onArchived={(result) => setSelectedId(result.newList?.id ?? null)}
        />
      )}
    </main>
  )
}

function ListButton({
  list,
  selected,
  onSelect,
}: {
  list: ShoppingList
  selected: boolean
  onSelect: () => void
}) {
  const remaining = list.items.filter((i) => !i.isBought).length
  return (
    <button
      onClick={onSelect}
      className={`flex items-center justify-between rounded-control px-3 py-2 text-left text-sm transition-colors ${
        selected ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-muted'
      }`}
    >
      <span className="min-w-0 truncate">
        {list.name}
        {list.status === 'ARCHIVED' && (
          <span className="ml-1 text-xs text-muted-foreground">(archived)</span>
        )}
      </span>
      {list.status === 'ACTIVE' && remaining > 0 && (
        <span className="ml-2 shrink-0 rounded-pill bg-surface px-2 text-xs text-muted-foreground">
          {remaining}
        </span>
      )}
    </button>
  )
}

function ListDetail({
  list,
  onArchive,
  onDelete,
}: {
  list: ShoppingList
  onArchive: () => void
  onDelete: () => void
}) {
  const isActive = list.status === 'ACTIVE'
  const { data: quickAddItems } = useItems({ quickAdd: true })
  const addItem = useAddShoppingItem(list.id)
  const updateItem = useUpdateShoppingItem(list.id)
  const removeItem = useRemoveShoppingItem(list.id)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo(() => groupByTag(list.items), [list.items])

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    setError(null)
    try {
      await addItem.mutateAsync({ itemName: name })
      setDraft('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add item.')
    }
  }

  return (
    <section className="min-w-0 rounded-card border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl font-medium text-ink">{list.name}</h2>
        <div className="flex gap-2">
          {isActive ? (
            <Button variant="outline" size="sm" onClick={onArchive}>
              Archive list
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {isActive && (
        <form onSubmit={onAdd} className="mb-4 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an item…"
            list="quick-add-items"
            aria-label="Add an item"
            className="min-w-0"
          />
          <datalist id="quick-add-items">
            {quickAddItems?.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
          <Button type="submit" className="shrink-0" disabled={addItem.isPending}>
            Add
          </Button>
        </form>
      )}

      {error && <p className="mb-2 text-sm text-warning">{error}</p>}

      {list.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">This list is empty.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([tag, rows]) => (
            <div key={tag}>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {tag}
              </h3>
              <div className="divide-y divide-line">
                {rows.map((row) => (
                  <CheckRow
                    key={row.id}
                    row={row}
                    disabled={!isActive}
                    onToggle={() =>
                      void updateItem.mutateAsync({ itemId: row.id, isBought: !row.isBought })
                    }
                    onRemove={() => void removeItem.mutateAsync(row.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
