import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import type { CreatePetInput, Pet, PublicUser, Species } from '@hame/shared'
import { SPECIES } from '@hame/shared'
import { AppNav } from '@/components/app-nav'
import { WidgetCard } from '@/components/features/widget-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { ApiError } from '@/api/client'
import { useCurrentUser } from '@/api/auth'
import { useCreatePet, useDeletePet, usePets } from '@/api/pets'

const SPECIES_LABEL: Record<Species, string> = {
  DOG: 'Dog',
  CAT: 'Cat',
  BIRD: 'Bird',
  RABBIT: 'Rabbit',
  OTHER: 'Other',
}
const selectClass = 'h-10 rounded-control border border-input bg-surface px-2 text-sm text-ink'

export function PetsPage() {
  const { data: me } = useCurrentUser()
  const { data: pets, isPending } = usePets()
  const deletePet = useDeletePet()
  const [formOpen, setFormOpen] = useState(false)

  async function handleDelete(pet: Pet) {
    if (!window.confirm(`Remove ${pet.name}?`)) return
    try {
      await deletePet.mutateAsync(pet.id)
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not remove pet.')
    }
  }

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Pets</h1>
        <AppNav user={(me as PublicUser | null) ?? null} />
      </header>

      <div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Add pet
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !pets || pets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pets yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pets.map((pet) => (
            <WidgetCard key={pet.id} title={SPECIES_LABEL[pet.species]}>
              <div className="flex items-center justify-between gap-3">
                <Link to={`/pets/${pet.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-serif text-xl text-ink hover:underline">{pet.name}</p>
                  {pet.breed && (
                    <p className="truncate text-sm text-muted-foreground">{pet.breed}</p>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDelete(pet)}
                  aria-label={`Remove ${pet.name}`}
                  className="shrink-0 rounded-control p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </WidgetCard>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Add pet">
        <PetForm onDone={() => setFormOpen(false)} />
      </Modal>
    </main>
  )
}

function PetForm({ onDone }: { onDone: () => void }) {
  const createPet = useCreatePet()
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<Species>('DOG')
  const [breed, setBreed] = useState('')
  const [dob, setDob] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Give your pet a name.')
    const payload: CreatePetInput = {
      name: name.trim(),
      species,
      breed: breed.trim() || null,
      dob: dob ? new Date(dob) : null,
      imageUrl: imageUrl.trim() || null,
    }
    try {
      await createPet.mutateAsync(payload)
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add pet.')
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pet-name">Name</Label>
        <Input
          id="pet-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rex"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pet-species">Species</Label>
        <select
          id="pet-species"
          value={species}
          onChange={(e) => setSpecies(e.target.value as Species)}
          className={selectClass}
        >
          {SPECIES.map((s) => (
            <option key={s} value={s}>
              {SPECIES_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pet-breed">Breed</Label>
        <Input
          id="pet-breed"
          value={breed}
          onChange={(e) => setBreed(e.target.value)}
          placeholder="Optional"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pet-dob">Date of birth</Label>
        <Input
          id="pet-dob"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-44"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pet-image">Photo URL</Label>
        <Input
          id="pet-image"
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://… (optional)"
        />
      </div>
      {error && <p className="text-sm text-warning">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={createPet.isPending}>
          Add pet
        </Button>
      </div>
    </form>
  )
}
