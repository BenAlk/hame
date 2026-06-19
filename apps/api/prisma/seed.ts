import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'
import { firstDueDate } from '@hame/shared'

// Load the repo-root .env so DATABASE_URL is available when run via tsx.
const here = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(here, '../../../.env') })

const prisma = new PrismaClient()

async function main() {
  const password = await argon2.hash('changeme123')

  const admin = await prisma.user.upsert({
    where: { username: 'ben' },
    update: {},
    create: {
      username: 'ben',
      password,
      firstName: 'Ben',
      surname: 'Alkureishi',
      colour: '#d16a6a',
      dob: new Date('1990-01-01'),
      role: 'ADMIN',
    },
  })
  console.log(`✅ Seeded admin user: ${admin.username} (password: changeme123)`)

  // A second household member so rotating chores have someone to cycle to.
  const partner = await prisma.user.upsert({
    where: { username: 'partner' },
    update: {},
    create: {
      username: 'partner',
      password,
      firstName: 'Robin',
      surname: 'Alkureishi',
      colour: '#6f8169',
      dob: new Date('1991-05-02'),
      role: 'MEMBER',
    },
  })

  // ── Tags ───────────────────────────────────────────────────────────────────
  const tagNames: { name: string; colour?: string }[] = [
    { name: 'quick-add', colour: '#6f8169' },
    { name: 'dairy', colour: '#2f6fb0' },
    { name: 'frozen', colour: '#2f6fb0' },
    { name: 'bakery', colour: '#c0492f' },
    { name: 'produce', colour: '#6f8169' },
  ]
  const tags: Record<string, string> = {}
  for (const t of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { name: t.name },
      update: {},
      create: { name: t.name, colour: t.colour ?? null },
    })
    tags[t.name] = tag.id
  }

  // ── Items ────────────────────────────────────────────────────────────────—
  interface ItemSpec {
    name: string
    baseUnit: string
    minimumQuantity?: number
    defaultUnit?: string
    tags?: string[]
  }
  const itemSpecs: ItemSpec[] = [
    {
      name: 'Milk',
      baseUnit: 'ml',
      minimumQuantity: 2000,
      defaultUnit: 'bottle',
      tags: ['quick-add', 'dairy'],
    },
    {
      name: 'Bread',
      baseUnit: 'unit',
      minimumQuantity: 1,
      defaultUnit: 'loaf',
      tags: ['quick-add', 'bakery'],
    },
    {
      name: 'Eggs',
      baseUnit: 'unit',
      minimumQuantity: 6,
      defaultUnit: 'box',
      tags: ['quick-add', 'dairy'],
    },
    { name: 'Butter', baseUnit: 'g', minimumQuantity: 250, tags: ['dairy'] },
    { name: 'Bananas', baseUnit: 'unit', defaultUnit: 'bunch', tags: ['quick-add', 'produce'] },
    { name: 'Chicken breast', baseUnit: 'g', tags: ['frozen'] },
    { name: 'Pasta', baseUnit: 'g', minimumQuantity: 500 },
    { name: 'Coffee', baseUnit: 'g', minimumQuantity: 200, tags: ['quick-add'] },
  ]

  const items: Record<string, string> = {}
  for (const spec of itemSpecs) {
    const item = await prisma.item.upsert({
      where: { name: spec.name },
      update: {},
      create: {
        name: spec.name,
        baseUnit: spec.baseUnit,
        minimumQuantity: spec.minimumQuantity ?? null,
        defaultUnit: spec.defaultUnit ?? null,
        createdById: admin.id,
        tags: { connect: spec.tags?.map((name) => ({ id: tags[name] })) ?? [] },
      },
    })
    items[spec.name] = item.id
  }

  // ── Storage locations ────────────────────────────────────────────────────—
  const locationNames = ['Main Fridge', 'Pantry Cupboard', 'Garage Freezer']
  const locations: Record<string, string> = {}
  for (const name of locationNames) {
    const loc = await prisma.storageLocation.upsert({
      where: { name },
      update: {},
      create: { name },
    })
    locations[name] = loc.id
  }

  // Seed shopping list + pantry only on a fresh database (idempotent guard).
  const existingLists = await prisma.shoppingList.count()
  if (existingLists === 0) {
    await prisma.shoppingList.create({
      data: {
        name: 'Weekly Shop',
        createdById: admin.id,
        items: {
          create: [
            { itemId: items['Milk'], quantity: 2, unit: 'bottle', addedById: admin.id },
            { itemId: items['Bread'], quantity: 1, unit: 'loaf', addedById: admin.id },
            { itemId: items['Bananas'], quantity: 1, unit: 'bunch', addedById: admin.id },
            { itemId: items['Coffee'], quantity: 200, unit: 'g', addedById: admin.id },
          ],
        },
      },
    })
    console.log('✅ Seeded "Weekly Shop" shopping list')
  }

  const existingPantry = await prisma.pantryEntry.count()
  if (existingPantry === 0) {
    const soon = new Date()
    soon.setDate(soon.getDate() + 2)
    await prisma.pantryEntry.createMany({
      data: [
        {
          itemId: items['Milk'],
          locationId: locations['Main Fridge'],
          quantity: 1,
          unit: 'l',
          expiryDate: soon,
          addedById: admin.id,
        },
        {
          itemId: items['Butter'],
          locationId: locations['Main Fridge'],
          quantity: 200,
          unit: 'g',
          addedById: admin.id,
        },
        {
          itemId: items['Eggs'],
          locationId: locations['Main Fridge'],
          quantity: 4,
          unit: 'unit',
          addedById: admin.id,
        },
        {
          itemId: items['Chicken breast'],
          locationId: locations['Garage Freezer'],
          quantity: 500,
          unit: 'g',
          addedById: admin.id,
        },
        {
          itemId: items['Pasta'],
          locationId: locations['Pantry Cupboard'],
          quantity: 1000,
          unit: 'g',
          addedById: admin.id,
        },
      ],
    })
    console.log('✅ Seeded pantry entries')
  }

  // ── Pets & chores (Phase 3) ──────────────────────────────────────────────—
  // Guarded so re-seeding an existing database leaves chore history untouched.
  if ((await prisma.chore.count()) === 0) {
    const rex = await prisma.pet.create({
      data: { name: 'Rex', species: 'DOG', breed: 'Border Collie', dob: new Date('2021-03-14') },
    })

    interface ChoreSpec {
      title: string
      recurrenceType: 'INTERVAL' | 'WEEKLY' | 'DATE_OF_MONTH' | 'ONE_OFF'
      intervalDays?: number
      weekdays?: (
        | 'MONDAY'
        | 'TUESDAY'
        | 'WEDNESDAY'
        | 'THURSDAY'
        | 'FRIDAY'
        | 'SATURDAY'
        | 'SUNDAY'
      )[]
      petId?: string
      rotating?: boolean
    }
    const choreSpecs: ChoreSpec[] = [
      { title: 'Rex worming', recurrenceType: 'INTERVAL', intervalDays: 30, petId: rex.id },
      { title: 'Rex flea treatment', recurrenceType: 'INTERVAL', intervalDays: 30, petId: rex.id },
      { title: 'Hoover downstairs', recurrenceType: 'WEEKLY', weekdays: ['SATURDAY'] },
      { title: 'Defrost dog food', recurrenceType: 'INTERVAL', intervalDays: 3, rotating: true },
    ]

    for (const spec of choreSpecs) {
      const rotating = spec.rotating === true
      const dueDate = firstDueDate({
        recurrenceType: spec.recurrenceType,
        intervalDays: spec.intervalDays,
        weekdays: spec.weekdays,
      })
      const firstAssigneeId = admin.id // rotation starts at the admin
      await prisma.chore.create({
        data: {
          title: spec.title,
          recurrenceType: spec.recurrenceType,
          intervalDays: spec.intervalDays ?? null,
          weekdays: spec.weekdays ?? [],
          petId: spec.petId ?? null,
          assignmentMode: rotating ? 'ROTATING' : 'FIXED',
          assignedToId: rotating ? null : admin.id,
          createdById: admin.id,
          ...(rotating && { rotatingUsers: { connect: [{ id: admin.id }, { id: partner.id }] } }),
          ...(dueDate && {
            instances: { create: { assignedToId: firstAssigneeId, dueDate } },
          }),
        },
      })
    }
    console.log('✅ Seeded Rex + starter chores')
  }
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
