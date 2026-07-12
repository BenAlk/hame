import { createContext, useContext, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/modal'
import { useCurrentUser } from '@/api/auth'
import { useMembers } from '@/api/users'
import { useCompleteInstance } from '@/api/chores'

/**
 * Completing a chore, with a "who did it?" step for the shared wall tablet
 * (spec §8.1). A normal signed-in member's completion is credited to them; but the
 * tablet account isn't a person, so when it completes a chore we first ask which
 * household member did it and credit them — otherwise it wouldn't count towards
 * anyone's chores. One picker modal is mounted here so every completion surface
 * (the dashboard widget, the Chores page) shares it.
 */
interface ChoreCompletionValue {
  /** Complete the given chore instance, prompting for the member on the tablet. */
  completeChore: (instanceId: string) => void
  isCompleting: boolean
}

const ChoreCompletionContext = createContext<ChoreCompletionValue | null>(null)

export function ChoreCompletionProvider({ children }: { children: ReactNode }) {
  const { data: currentUser } = useCurrentUser()
  const { data: members } = useMembers()
  const complete = useCompleteInstance()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const isTablet = currentUser?.role === 'TABLET'

  function completeChore(instanceId: string) {
    // The tablet must attribute the completion to a person; everyone else is
    // themselves, so complete straight away.
    if (isTablet) setPendingId(instanceId)
    else void complete.mutateAsync({ id: instanceId })
  }

  function creditTo(memberId: string) {
    if (!pendingId) return
    const id = pendingId
    setPendingId(null)
    void complete.mutateAsync({ id, completedById: memberId })
  }

  return (
    <ChoreCompletionContext.Provider value={{ completeChore, isCompleting: complete.isPending }}>
      {children}
      <Modal
        open={pendingId !== null}
        onClose={() => setPendingId(null)}
        title="Who completed this?"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Tap the person who did it, so it counts towards their chores.
        </p>
        <div className="flex flex-col gap-2">
          {members?.map((member) => (
            <button
              key={member.id}
              type="button"
              disabled={complete.isPending}
              onClick={() => creditTo(member.id)}
              className="flex items-center gap-3 rounded-inner border border-line px-4 py-3 text-left transition-colors hover:border-accent disabled:opacity-50"
            >
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-pill"
                style={{ backgroundColor: member.colour }}
              />
              <span className="text-sm text-ink">{member.firstName}</span>
            </button>
          ))}
        </div>
      </Modal>
    </ChoreCompletionContext.Provider>
  )
}

export function useChoreCompletion(): ChoreCompletionValue {
  const ctx = useContext(ChoreCompletionContext)
  if (!ctx) throw new Error('useChoreCompletion must be used within a ChoreCompletionProvider')
  return ctx
}
