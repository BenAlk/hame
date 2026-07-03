import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'
import { firstDueDate, DEFAULT_DASHBOARD } from '@hame/shared'

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
  // A curated starter palette grouped by purpose. Colours follow the Hearth
  // tokens (design-specification.md §3) and are assigned per *group*, not per
  // tag, so chips stay calm and scan by category. Recipe tags drive library
  // browsing; ingredient tags drive shopping-list grouping (§8.3) and the pantry
  // storage hint. `quick-add` is the one tag that also drives UI behaviour (§8.2).
  // This is a strong default, not exhaustive — the long tail (more cuisines,
  // dish types, occasions) is created on the fly when tagging items/recipes.
  const tagGroups: { colour: string; names: string[] }[] = [
    // Behavioural (shopping quick-add dropdown)
    { colour: '#6f8169', names: ['quick-add'] },
    // Recipe — course & occasion
    {
      colour: '#6f8169',
      names: [
        'breakfast',
        'brunch',
        'lunch',
        'dinner',
        'snack',
        'dessert',
        'side',
        'starter',
        'party-food',
        'roast-dinner',
        'bbq',
      ],
    },
    // Recipe — effort & time
    {
      colour: '#857a6c',
      names: ['quick', 'one-pot', 'slow-cooker', 'batch-cook', 'freezer-friendly'],
    },
    // Recipe — cuisine
    {
      colour: '#7d2b3e',
      names: ['british', 'italian', 'indian', 'chinese', 'thai', 'mexican'],
    },
    // Dietary — shared by recipes & ingredients
    {
      colour: '#d16a6a',
      names: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'healthy'],
    },
    // Ingredient — storage type (drives the pantry default + expiry hint)
    { colour: '#2f6fb0', names: ['fresh', 'chilled', 'frozen', 'ambient'] },
    // Ingredient — shop section / aisle (drives shopping-list grouping, §8.3)
    {
      colour: '#9aa0a6',
      names: [
        'produce',
        'dairy',
        'meat',
        'fish',
        'bakery',
        'tinned',
        'dry-goods',
        'condiments',
        'snacks',
        'drinks',
        'household',
        'pet',
      ],
    },
  ]
  const tags: Record<string, string> = {}
  for (const group of tagGroups) {
    for (const name of group.names) {
      const tag = await prisma.tag.upsert({
        where: { name },
        update: { colour: group.colour }, // keep the starter palette authoritative on re-seed
        create: { name, colour: group.colour },
      })
      tags[name] = tag.id
    }
  }

  // ── Items ────────────────────────────────────────────────────────────────—
  interface ItemSpec {
    name: string
    baseUnit: string
    minimumQuantity?: number
    defaultUnit?: string
    tags?: string[]
    isConsumable?: boolean
    reorderIntervalDays?: number
  }
  const itemSpecs: ItemSpec[] = [
    {
      name: 'Milk',
      baseUnit: 'ml',
      minimumQuantity: 2000,
      defaultUnit: 'bottle',
      tags: ['quick-add', 'dairy', 'chilled'],
    },
    {
      name: 'Bread',
      baseUnit: 'unit',
      minimumQuantity: 1,
      defaultUnit: 'loaf',
      tags: ['quick-add', 'bakery', 'fresh'],
    },
    {
      name: 'Eggs',
      baseUnit: 'unit',
      minimumQuantity: 6,
      defaultUnit: 'box',
      tags: ['quick-add', 'dairy', 'chilled'],
    },
    { name: 'Butter', baseUnit: 'g', minimumQuantity: 250, tags: ['dairy', 'chilled'] },
    {
      name: 'Bananas',
      baseUnit: 'unit',
      defaultUnit: 'bunch',
      tags: ['quick-add', 'produce', 'fresh'],
    },
    { name: 'Chicken breast', baseUnit: 'g', tags: ['frozen', 'meat'] },
    { name: 'Pasta', baseUnit: 'g', minimumQuantity: 500, tags: ['dry-goods', 'ambient'] },
    { name: 'Coffee', baseUnit: 'g', minimumQuantity: 200, tags: ['quick-add', 'ambient'] },
    // Consumables (spec §8.3): household re-order goods, not recipe/expiry tracked.
    {
      name: 'Toilet roll',
      baseUnit: 'unit',
      defaultUnit: 'pack',
      isConsumable: true,
      reorderIntervalDays: 21,
    },
    {
      name: 'Kitchen roll',
      baseUnit: 'unit',
      defaultUnit: 'pack',
      isConsumable: true,
      reorderIntervalDays: 30,
    },
    {
      name: 'Dishwasher tablets',
      baseUnit: 'unit',
      defaultUnit: 'box',
      isConsumable: true,
      reorderIntervalDays: 45,
    },
    { name: 'Washing-up liquid', baseUnit: 'ml', defaultUnit: 'bottle', isConsumable: true },
    { name: 'Kitchen foil', baseUnit: 'unit', defaultUnit: 'roll', isConsumable: true },
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
        isConsumable: spec.isConsumable ?? false,
        reorderIntervalDays: spec.reorderIntervalDays ?? null,
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

  // ── Household settings (Phase 4) ─────────────────────────────────────────—
  await prisma.householdSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', enabledMealTypes: ['DINNER'] },
  })

  // ── Household dashboard (Phase 7.1) ──────────────────────────────────────—
  // The shared wall-tablet layout. Personal layouts are created on first save;
  // un-customised owners fall back to the default, so this just primes the tablet.
  await prisma.dashboardLayout.upsert({
    where: { id: 'household' },
    update: {},
    create: {
      id: 'household',
      isHousehold: true,
      layout: DEFAULT_DASHBOARD.layout as object,
      widgets: DEFAULT_DASHBOARD.widgets as object,
    },
  })

  // ── Recipes & meal plan (Phase 4) ────────────────────────────────────────—
  // Guarded so re-seeding leaves any hand-entered recipes untouched.
  if ((await prisma.recipe.count()) === 0) {
    // Ingredient items, minted with base units so generate-shopping-list maths work.
    interface RecipeItemSpec {
      name: string
      baseUnit?: string
      isStaple?: boolean
    }
    async function ensureItem(spec: RecipeItemSpec): Promise<string> {
      const existing = await prisma.item.findFirst({
        where: { name: { equals: spec.name, mode: 'insensitive' } },
      })
      if (existing) return existing.id
      const created = await prisma.item.create({
        data: {
          name: spec.name,
          baseUnit: spec.baseUnit ?? null,
          isStaple: spec.isStaple ?? false,
          createdById: admin.id,
        },
      })
      return created.id
    }

    interface IngredientSpec extends RecipeItemSpec {
      quantity?: number | null
      unit?: string | null
      notes?: string | null
    }
    interface RecipeSpec {
      title: string
      description: string
      servings: number
      prepTimeMinutes?: number
      cookTimeMinutes?: number
      ingredients: IngredientSpec[]
      steps: string[]
    }
    const recipeSpecs: RecipeSpec[] = [
      {
        title: 'Spaghetti Bolognese',
        description: 'A weeknight classic the whole household will eat.',
        servings: 4,
        prepTimeMinutes: 15,
        cookTimeMinutes: 40,
        ingredients: [
          { name: 'Spaghetti', baseUnit: 'g', quantity: 400, unit: 'g' },
          { name: 'Beef mince', baseUnit: 'g', quantity: 500, unit: 'g' },
          { name: 'Onion', baseUnit: 'unit', quantity: 1, unit: 'unit' },
          { name: 'Chopped tomatoes', baseUnit: 'unit', quantity: 2, unit: 'can' },
          { name: 'Salt', baseUnit: 'g', isStaple: true, quantity: null, notes: 'to taste' },
        ],
        steps: [
          'Brown the mince in a large pan over medium-high heat.',
          'Add the diced onion and cook until soft.',
          'Stir in the chopped tomatoes and simmer for 30 minutes.',
          'Meanwhile cook the spaghetti, then combine and season.',
        ],
      },
      {
        title: 'Veggie Stir-Fry',
        description: 'Fast, fresh and endlessly adaptable.',
        servings: 2,
        prepTimeMinutes: 10,
        cookTimeMinutes: 10,
        ingredients: [
          { name: 'Rice', baseUnit: 'g', quantity: 200, unit: 'g' },
          { name: 'Mixed vegetables', baseUnit: 'g', quantity: 400, unit: 'g' },
          { name: 'Soy sauce', baseUnit: 'ml', quantity: 30, unit: 'ml' },
        ],
        steps: [
          'Cook the rice to packet instructions.',
          'Stir-fry the vegetables on high heat for 5 minutes.',
          'Add soy sauce, toss through and serve over the rice.',
        ],
      },
    ]

    let firstRecipeId: string | null = null
    for (const spec of recipeSpecs) {
      const ingredientRows = []
      for (const [order, ing] of spec.ingredients.entries()) {
        const itemId = await ensureItem(ing)
        ingredientRows.push({
          itemId,
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          notes: ing.notes ?? null,
          order,
        })
      }
      const recipe = await prisma.recipe.create({
        data: {
          title: spec.title,
          description: spec.description,
          servings: spec.servings,
          prepTimeMinutes: spec.prepTimeMinutes ?? null,
          cookTimeMinutes: spec.cookTimeMinutes ?? null,
          createdById: admin.id,
          ingredients: { create: ingredientRows },
          steps: { create: spec.steps.map((text, order) => ({ text, order })) },
        },
      })
      firstRecipeId ??= recipe.id
    }

    // Plan the Bolognese for dinner tonight so the dashboard has something to show.
    if (firstRecipeId) {
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      await prisma.mealPlanEntry.create({
        data: {
          date: today,
          mealType: 'DINNER',
          recipeId: firstRecipeId,
          createdById: admin.id,
        },
      })
    }
    console.log("✅ Seeded starter recipes + tonight's meal")
  }
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
