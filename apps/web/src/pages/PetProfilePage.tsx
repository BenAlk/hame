import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { PublicUser, Species } from '@hame/shared'
import { AppNav } from '@/components/app-nav'
import { WidgetCard } from '@/components/features/widget-card'
import { useCurrentUser } from '@/api/auth'
import { usePet } from '@/api/pets'
import { formatDate } from '@/lib/format'

const SPECIES_LABEL: Record<Species, string> = {
  DOG: 'Dog',
  CAT: 'Cat',
  BIRD: 'Bird',
  RABBIT: 'Rabbit',
  OTHER: 'Other',
}

export function PetProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { data: me } = useCurrentUser()
  const { data: pet, isPending, isError } = usePet(id)

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/pets"
          className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
        >
          <ArrowLeft className="size-4" />
          All pets
        </Link>
        <AppNav user={(me as PublicUser | null) ?? null} />
      </header>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !pet ? (
        <p className="text-sm text-muted-foreground">That pet could not be found.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <WidgetCard title={SPECIES_LABEL[pet.species]}>
            {/* Hearth photo placeholder (design §6) when no image is set. */}
            <div className="mb-4 flex aspect-square items-center justify-center rounded-[14px] border border-dashed border-line bg-accent-soft">
              {pet.imageUrl ? (
                <img
                  src={pet.imageUrl}
                  alt={pet.name}
                  className="size-full rounded-[14px] object-cover"
                />
              ) : (
                <span className="font-mono text-xs text-muted-foreground">pet photo</span>
              )}
            </div>
            <p className="font-serif text-2xl text-ink">{pet.name}</p>
            {pet.breed && <p className="text-sm text-muted-foreground">{pet.breed}</p>}
            {pet.dob && (
              <p className="mt-1 text-sm text-muted-foreground">Born {formatDate(pet.dob)}</p>
            )}
          </WidgetCard>

          <WidgetCard title="Treatment history" action={<span>{pet.treatmentHistory.length}</span>}>
            {pet.treatmentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed treatments yet. Completed chores linked to {pet.name} show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {pet.treatmentHistory.map((instance) => (
                  <li key={instance.id} className="flex items-center gap-3 text-sm">
                    <span
                      aria-hidden
                      className="inline-block size-2.5 shrink-0 rounded-pill"
                      style={{ backgroundColor: instance.completedBy?.colour ?? 'var(--line)' }}
                    />
                    <span className="min-w-0 flex-1 truncate text-ink">{instance.chore.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {instance.completedAt && formatDate(instance.completedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </WidgetCard>
        </div>
      )}
    </main>
  )
}
