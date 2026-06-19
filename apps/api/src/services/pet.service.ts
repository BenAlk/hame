import type { Pet as PrismaPet } from '@prisma/client'
import type { CreatePetInput, Pet, PetWithHistory, UpdatePetInput } from '@hame/shared'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { instanceInclude, toChoreInstance } from './chore.service.js'

export function toPet(pet: PrismaPet): Pet {
  return {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    dob: pet.dob,
    imageUrl: pet.imageUrl,
    createdAt: pet.createdAt,
  }
}

export async function listPets(): Promise<Pet[]> {
  const pets = await prisma.pet.findMany({ orderBy: { name: 'asc' } })
  return pets.map(toPet)
}

/** A pet plus its treatment history — completed instances of its chores (spec §8.8). */
export async function getPet(id: string): Promise<PetWithHistory> {
  const pet = await prisma.pet.findUnique({ where: { id } })
  if (!pet) throw HttpError.notFound('Pet not found')

  const history = await prisma.choreInstance.findMany({
    where: { chore: { petId: id }, completedAt: { not: null } },
    include: instanceInclude,
    orderBy: { completedAt: 'desc' },
  })
  return { ...toPet(pet), treatmentHistory: history.map(toChoreInstance) }
}

export async function createPet(input: CreatePetInput): Promise<Pet> {
  const pet = await prisma.pet.create({
    data: {
      name: input.name,
      species: input.species,
      breed: input.breed ?? null,
      dob: input.dob ?? null,
      imageUrl: input.imageUrl ?? null,
    },
  })
  return toPet(pet)
}

export async function updatePet(id: string, input: UpdatePetInput): Promise<Pet> {
  const existing = await prisma.pet.findUnique({ where: { id } })
  if (!existing) throw HttpError.notFound('Pet not found')
  const pet = await prisma.pet.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.species !== undefined && { species: input.species }),
      ...(input.breed !== undefined && { breed: input.breed }),
      ...(input.dob !== undefined && { dob: input.dob }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
    },
  })
  return toPet(pet)
}

export async function deletePet(id: string): Promise<void> {
  const pet = await prisma.pet.findUnique({
    where: { id },
    include: { _count: { select: { chores: true } } },
  })
  if (!pet) throw HttpError.notFound('Pet not found')
  if (pet._count.chores > 0) {
    throw HttpError.conflict('This pet has chores linked to it')
  }
  await prisma.pet.delete({ where: { id } })
}
