import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Chore, CreateChoreInput } from '@hame/shared'
import { WidgetCard } from '@/components/features/widget-card'
import { ChoreCheckRow } from '@/components/features/chores/chore-check-row'
import { ChoreForm } from '@/components/features/chores/chore-form'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/api/client'
import { useMembers } from '@/api/users'
import { usePets } from '@/api/pets'
import {
  useChores,
  useCompleteInstance,
  useCreateChore,
  useDeleteChore,
  useUpdateChore,
} from '@/api/chores'
import { isOverdueOrToday } from '@/lib/format'

/** Sort key: overdue/today first by due date, undated chores last. */
function dueRank(chore: Chore): number {
  if (!chore.openInstance) return Number.MAX_SAFE_INTEGER
  return new Date(chore.openInstance.dueDate).getTime()
}

export function ChoresPage() {
  const { data: chores, isPending } = useChores(true)
  const { data: members } = useMembers()
  const { data: pets } = usePets()

  const createChore = useCreateChore()
  const updateChore = useUpdateChore()
  const deleteChore = useDeleteChore()
  const completeInstance = useCompleteInstance()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Chore | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Chore | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...(chores ?? [])].sort((a, b) => dueRank(a) - dueRank(b)),
    [chores],
  )
  const { due, upcoming } = useMemo(() => {
    const due: Chore[] = []
    const upcoming: Chore[] = []
    for (const c of sorted) {
      if (c.openInstance && isOverdueOrToday(c.openInstance.dueDate)) due.push(c)
      else upcoming.push(c)
    }
    return { due, upcoming }
  }, [sorted])

  function openNew() {
    setEditing(null)
    setError(null)
    setFormOpen(true)
  }
  function openEdit(chore: Chore) {
    setEditing(chore)
    setError(null)
    setFormOpen(true)
  }

  async function handleSubmit(input: CreateChoreInput) {
    setError(null)
    try {
      if (editing) await updateChore.mutateAsync({ id: editing.id, ...input })
      else await createChore.mutateAsync(input)
      setFormOpen(false)
      setEditing(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the chore.')
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleteError(null)
    try {
      await deleteChore.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete the chore.')
    }
  }

  function renderRows(list: Chore[]) {
    return (
      <div className="divide-y divide-line">
        {list.map((chore) => (
          <ChoreCheckRow
            key={chore.id}
            chore={chore}
            onComplete={(instanceId) => void completeInstance.mutateAsync({ id: instanceId })}
            onEdit={() => openEdit(chore)}
            onDelete={() => {
              setDeleteError(null)
              setPendingDelete(chore)
            }}
            disabled={completeInstance.isPending}
          />
        ))}
      </div>
    )
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Chores</h1>
      </header>

      <div>
        <Button onClick={openNew}>
          <Plus className="size-4" />
          New chore
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No chores yet. Add one to start tracking the household.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <WidgetCard title="Due now" action={<span>{due.length}</span>}>
            {due.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due. Nice.</p>
            ) : (
              renderRows(due)
            )}
          </WidgetCard>
          <WidgetCard title="Upcoming" action={<span>{upcoming.length}</span>}>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled ahead.</p>
            ) : (
              renderRows(upcoming)
            )}
          </WidgetCard>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit chore' : 'New chore'}
      >
        <ChoreForm
          chore={editing ?? undefined}
          users={members ?? []}
          pets={pets ?? []}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
          submitting={createChore.isPending || updateChore.isPending}
          error={error}
        />
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete chore?"
        confirmLabel="Delete chore"
        pending={deleteChore.isPending}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      >
        Delete <span className="font-semibold">{pendingDelete?.title}</span> and its completion
        history? This can&apos;t be undone.
      </ConfirmDialog>
    </main>
  )
}
