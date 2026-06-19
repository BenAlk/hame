# Hame — Project Specification & Design Document

> A self-hosted household management application for couples and families.
> **"Hame"** is Scots for "home."

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Context & Background](#2-context--background)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Tech Stack](#4-tech-stack)
5. [Project Structure](#5-project-structure)
6. [Naming Conventions](#6-naming-conventions)
7. [Data Models](#7-data-models)
8. [Feature Specifications](#8-feature-specifications)
9. [Architecture Patterns](#9-architecture-patterns)
10. [Build Roadmap](#10-build-roadmap)
11. [Security & Conventions](#11-security--conventions)
12. [Future Enhancements](#12-future-enhancements)
13. [Portfolio Framing](#13-portfolio-framing)
14. [Glossary](#14-glossary)

---

## 1. Project Overview

**Hame** is a self-hosted, full-stack web application that brings together everything a household needs into one place: shopping lists, recipes, meal planning, pantry tracking, cleaning schedules, pet care, bin collection reminders, a shared calendar, and smart home controls via Home Assistant.

It is designed to run on a TrueNAS Scale homelab as a Docker container, exposed via Cloudflare proxy and accessed by household members through a web browser or installable PWA. The primary visual target is a wall-mounted tablet acting as a household dashboard.

This is both a **functional product** (genuinely useful to the household) and a **portfolio project** (designed to showcase modern full-stack development skills).

---

## 2. Context & Background

### Homelab Environment

The app runs alongside a self-hosted stack on TrueNAS Scale:

- **Docker containers**: Immich (photo library), Memos (notes), Nginx Proxy Manager, plus various other self-hosted services
- **Virtual Machines**: Home Assistant OS (HAOS)
- **External access**: Cloudflare proxy + DDNS for domain → home IP
  - Most subdomains use Cloudflare proxy (orange cloud)
- **Sensitive admin apps** (e.g. the TrueNAS UI) are NOT exposed publicly — internal access only

### Why Build From Scratch

Rather than wiring together existing self-hosted apps (Grocy, Mealie, Vikunja), Hame is being built as a full custom application to:

- Serve as a substantive portfolio piece showing full-stack capability
- Provide exactly the features needed without app-juggling
- Allow tight integration between features (e.g., meal plan → pantry check → shopping list)
- Build skills with modern TS / React / Express / Prisma / Postgres / Docker stack

### Household

- **Ben** (admin) — primary builder and user
- **Partner** (member) — secondary user
- **Pets** — dog (with specific care reminders for worming, flea treatment, dog food defrost rotation)

---

## 3. Goals & Non-Goals

### Goals

- ✅ Single unified app replacing the need for Grocy/Mealie/Vikunja and similar
- ✅ Genuinely useful for daily household life
- ✅ Modern full-stack architecture suitable for portfolio
- ✅ Wall-tablet dashboard with widgets
- ✅ Home Assistant integration for smart home control + notifications
- ✅ External calendar aggregation
- ✅ Beautiful UI that demonstrates design sensibility

### Non-Goals

- ❌ Multi-tenancy beyond a single household
- ❌ Open registration / public-facing SaaS
- ❌ Native mobile apps (PWA only)
- ❌ Server-side rendering / SEO concerns
- ❌ Migration tooling from other apps (Grocy etc.)

---

## 4. Tech Stack

### Language

- **TypeScript** everywhere (frontend, backend, shared)

### Frontend

| Category       | Choice               | Rationale                                            |
| -------------- | -------------------- | ---------------------------------------------------- |
| Build tool     | Vite                 | Fast, simple, modern SPA tooling                     |
| Framework      | React                | Existing experience, vast ecosystem                  |
| Routing        | React Router v7      | Standard for SPA routing                             |
| Styling        | Tailwind CSS         | Industry standard, rapid iteration                   |
| Components     | shadcn/ui            | Components copied into project (owned, not imported) |
| Server state   | TanStack Query       | Caching, refetch, optimistic updates                 |
| Client state   | Zustand              | Lightweight, no boilerplate                          |
| Forms          | React Hook Form      | Performant, minimal re-renders                       |
| Validation     | Zod                  | TS-first; **shared schemas with backend**            |
| Dates          | date-fns             | Modular, tree-shakeable                              |
| Icons          | Lucide React         | Clean, large selection                               |
| Calendar UI    | FullCalendar         | Polished, multiple views                             |
| Dashboard grid | react-grid-layout    | Drag-and-drop widget layout                          |
| WebSocket      | Native WebSocket API | Real-time updates from the Hame backend (incl. HA)   |
| PWA            | Vite PWA Plugin      | Installable on tablet/phone                          |

### Backend

| Category         | Choice       | Rationale                             |
| ---------------- | ------------ | ------------------------------------- |
| Framework        | Express      | Mature, familiar, full ecosystem      |
| ORM              | Prisma       | Type-safe DB, great DX, migrations    |
| Database         | PostgreSQL   | Industry standard, scales             |
| Validation       | Zod          | Same schemas as frontend              |
| Auth             | jose (JWT)   | Modern, better TS than `jsonwebtoken` |
| Passwords        | argon2       | Current best practice                 |
| WebSocket client | `ws`         | Standard Node lib for talking to HA   |
| Scheduled jobs   | node-cron    | In-process; the API must run single-instance (no replicas) or jobs double-fire |
| Logging          | Pino         | Fast, structured JSON logs            |
| Uploads          | multer       | Avatars and recipe images             |
| Image processing | sharp        | Resize uploaded images                |
| Env config       | dotenv + Zod | Fail-fast env validation at startup   |

### Security Middleware

- `helmet` — security headers
- `cors` — locked-down CORS policy
- `express-rate-limit` — brute force prevention on auth endpoints

### Testing

- **Vitest** — frontend and backend
- **React Testing Library** — component tests
- **Supertest** — API endpoint tests

### DevOps

- **Docker + Docker Compose** — local dev and production
- **GitHub Actions** — CI (lint + test)
- **ESLint + Prettier** — code quality
- **Husky + lint-staged** — pre-commit hooks

---

## 5. Project Structure

**Monorepo** using **pnpm workspaces**.

```
hame/
├── apps/
│   ├── web/                         # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/              # shadcn/ui primitives
│   │   │   │   └── features/        # business components
│   │   │   ├── pages/               # route-level pages
│   │   │   ├── hooks/               # custom React hooks
│   │   │   ├── lib/                 # client utilities
│   │   │   ├── stores/              # Zustand stores
│   │   │   ├── api/                 # TanStack Query hooks + API client
│   │   │   ├── styles/              # global styles
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                         # Express backend
│       ├── src/
│       │   ├── routes/              # Express route definitions
│       │   ├── controllers/         # request handlers (HTTP layer)
│       │   ├── services/            # business logic
│       │   ├── middleware/          # auth, error handling, validation
│       │   ├── lib/                 # server utilities
│       │   ├── jobs/                # cron jobs
│       │   ├── integrations/        # HA client, future scrapers
│       │   │   └── home-assistant/
│       │   └── index.ts             # entry point
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared/                      # shared between web & api
│       ├── src/
│       │   ├── schemas/             # Zod schemas (shared validation)
│       │   ├── types/               # shared TypeScript types
│       │   └── constants/
│       ├── tsconfig.json
│       └── package.json
│
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── nginx.conf
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── docker-compose.yml               # local dev
├── docker-compose.prod.yml          # production
├── pnpm-workspace.yaml
├── package.json                     # root with workspace scripts
├── .env.example
├── .gitignore
├── .prettierrc
├── .eslintrc.cjs
└── README.md
```

### Notes

- **Prisma lives in `apps/api/prisma/`** — backend-only concern. Frontend imports types via Zod schemas from `@hame/shared`, never directly from Prisma.
- **Controllers vs Services** — controllers handle HTTP (req/res, status codes). Services contain business logic and are testable in isolation.
- **`integrations/`** — clear home for HA WebSocket client, future bin scraper, calendar sync workers.

---

## 6. Naming Conventions

| Element          | Convention                   | Example                   |
| ---------------- | ---------------------------- | ------------------------- |
| Components       | PascalCase                   | `ShoppingList.tsx`        |
| Hooks            | camelCase with `use` prefix  | `useCurrentUser.ts`       |
| Utility files    | kebab-case                   | `format-date.ts`          |
| Folders          | kebab-case                   | `shopping-list/`          |
| Types/Interfaces | PascalCase                   | `User`, `ShoppingItem`    |
| Zod schemas      | PascalCase + `Schema` suffix | `UserSchema`              |
| Database fields  | camelCase                    | `createdAt`, `isBought`   |
| API routes       | kebab-case                   | `/api/shopping-lists/:id` |
| Environment vars | UPPER_SNAKE_CASE             | `DATABASE_URL`, `HA_URL`  |

---

## 7. Data Models

All models defined in `apps/api/prisma/schema.prisma`. 24 models total.

### 7.1 Auth & Users

```prisma
model User {
  id          String   @id @default(uuid())
  username    String   @unique
  password    String                            // argon2 hashed
  firstName   String
  surname     String
  avatarUrl   String?
  colour      String                            // hex, e.g. "#3B82F6"
  dob         DateTime @db.Date                 // birthday — no time component
  role        Role     @default(MEMBER)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
  shoppingListsCreated   ShoppingList[]
  shoppingItemsAdded     ShoppingListItem[]
  itemsCreated           Item[]
  recipesCreated         Recipe[]
  mealPlanEntriesCreated MealPlanEntry[]
  pantryEntriesAdded     PantryEntry[]
  choresCreated          Chore[]     @relation("ChoreCreator")
  choresAssigned         Chore[]     @relation("ChoreAssignee")
  choresRotation         Chore[]     @relation("ChoreRotation")
  instancesAssigned      ChoreInstance[]  @relation("InstanceAssignee")
  instancesCompleted     ChoreInstance[]  @relation("InstanceCompleter")
  customEventsCreated    CustomEvent[]
  dashboardLayout        DashboardLayout?
  notificationPrefs      NotificationPreference?
}

enum Role {
  ADMIN
  MEMBER
}
```

### 7.2 Tags & Items (Foundation Layer)

```prisma
model Item {
  id              String              @id @default(uuid())
  name            String              @unique
  defaultQuantity Float?
  defaultUnit     String?                       // "g", "ml", "pack"
  baseUnit        String?                       // canonical unit for stock maths — see §9.2
  minimumQuantity Float?                        // triggers low stock (expressed in baseUnit)
  isStaple        Boolean             @default(false)  // pantry staple (salt, water) — excluded from generated shopping lists
  createdById     String
  createdBy       User                @relation(fields: [createdById], references: [id])
  tags            Tag[]               @relation("ItemTags")
  shoppingItems   ShoppingListItem[]
  pantryEntries   PantryEntry[]
  recipeUses      RecipeIngredient[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
}

model Tag {
  id        String   @id @default(uuid())
  name      String   @unique             // "dairy", "frozen", "quick-add", "tesco"
  colour    String?                      // hex for chip display
  items     Item[]   @relation("ItemTags")
  recipes   Recipe[] @relation("RecipeTags")
  chores    Chore[]  @relation("ChoreTags")
}
```

**Special tags** (semantic, not enforced in schema):

- `quick-add` — items appearing in the shopping list quick-add dropdown

### 7.3 Shopping

```prisma
model ShoppingList {
  id          String             @id @default(uuid())
  name        String                                       // "Weekly Shop"
  status      ListStatus         @default(ACTIVE)
  createdById String
  createdBy   User               @relation(fields: [createdById], references: [id])
  items       ShoppingListItem[]
  archivedAt  DateTime?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
}

model ShoppingListItem {
  id               String        @id @default(uuid())
  listId           String
  list             ShoppingList  @relation(fields: [listId], references: [id])
  itemId           String
  item             Item          @relation(fields: [itemId], references: [id])
  quantity         Float?
  unit             String?
  notes            String?
  isBought         Boolean       @default(false)
  boughtAt         DateTime?
  addedById        String
  addedBy          User          @relation(fields: [addedById], references: [id])
  rolledOverFromId String?                                   // self-relation (see below)
  rolledOverFrom   ShoppingListItem?  @relation("ItemRollover", fields: [rolledOverFromId], references: [id])
  rolledOverTo     ShoppingListItem[] @relation("ItemRollover")
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
}

enum ListStatus {
  ACTIVE
  ARCHIVED
}
```

### 7.4 Pantry

```prisma
model StorageLocation {
  id          String        @id @default(uuid())
  name        String        @unique               // "Main Fridge"
  icon        String?
  pantryItems PantryEntry[]
  createdAt   DateTime      @default(now())
}

model PantryEntry {
  id                 String           @id @default(uuid())
  itemId             String
  item               Item             @relation(fields: [itemId], references: [id])
  locationId         String
  location           StorageLocation  @relation(fields: [locationId], references: [id])
  quantity           Float
  unit               String?
  expiryDate         DateTime?        @db.Date
  addedById          String
  addedBy            User             @relation(fields: [addedById], references: [id])
  fromShoppingItemId String?                                   // soft reference for traceability (no FK)
  addedAt            DateTime         @default(now())
  updatedAt          DateTime         @updatedAt
}
```

### 7.5 Recipes & Meal Planning

```prisma
model Recipe {
  id              String              @id @default(uuid())
  title           String
  description     String?
  imageUrl        String?
  sourceUrl       String?                                       // if URL-imported
  prepTimeMinutes Int?
  cookTimeMinutes Int?
  servings        Int                 @default(4)
  createdById     String
  createdBy       User                @relation(fields: [createdById], references: [id])
  ingredients     RecipeIngredient[]
  steps           RecipeStep[]
  tags            Tag[]               @relation("RecipeTags")
  mealEntries     MealPlanEntry[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
}

model RecipeIngredient {
  id        String  @id @default(uuid())
  recipeId  String
  recipe    Recipe  @relation(fields: [recipeId], references: [id])
  itemId    String
  item      Item    @relation(fields: [itemId], references: [id])
  quantity  Float
  unit      String?
  notes     String?                       // "finely chopped"
  optional  Boolean @default(false)
  order     Int
}

model RecipeStep {
  id        String  @id @default(uuid())
  recipeId  String
  recipe    Recipe  @relation(fields: [recipeId], references: [id])
  order     Int
  text      String
}

model MealPlanEntry {
  id          String     @id @default(uuid())
  date        DateTime   @db.Date
  mealType    MealType
  recipeId    String?                                  // null for non-recipe meals
  recipe      Recipe?    @relation(fields: [recipeId], references: [id])
  customLabel String?                                  // "Takeaway"
  servings    Int?                                     // overrides recipe default
  notes       String?
  createdById String
  createdBy   User       @relation(fields: [createdById], references: [id])
  createdAt   DateTime   @default(now())
}

model HouseholdSettings {
  id               String     @id @default("singleton")   // enforce single row
  enabledMealTypes MealType[] @default([DINNER])
  updatedAt        DateTime   @updatedAt
}

enum MealType {
  BREAKFAST
  LUNCH
  DINNER
  SNACK
}
```

### 7.6 Chores & Pets

```prisma
model Pet {
  id        String    @id @default(uuid())
  name      String
  species   Species
  breed     String?
  dob       DateTime? @db.Date
  imageUrl  String?
  chores    Chore[]
  createdAt DateTime  @default(now())
}

model Chore {
  id              String           @id @default(uuid())
  title           String
  description     String?
  recurrenceType  RecurrenceType
  intervalDays    Int?                              // for INTERVAL
  weekdays        Weekday[]                         // for WEEKLY
  dayOfMonth      Int?                              // for DATE_OF_MONTH
  oneOffDate      DateTime?                         // for ONE_OFF
  assignmentMode  AssignmentMode   @default(FIXED)
  assignedToId    String?
  assignedTo      User?            @relation("ChoreAssignee", fields: [assignedToId], references: [id])
  rotatingUsers   User[]           @relation("ChoreRotation")
  petId           String?
  pet             Pet?             @relation(fields: [petId], references: [id])
  tags            Tag[]            @relation("ChoreTags")
  isActive        Boolean          @default(true)
  createdById     String
  createdBy       User             @relation("ChoreCreator", fields: [createdById], references: [id])
  instances       ChoreInstance[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}

model ChoreInstance {
  id            String    @id @default(uuid())
  choreId       String
  chore         Chore     @relation(fields: [choreId], references: [id])
  assignedToId  String
  assignedTo    User      @relation("InstanceAssignee", fields: [assignedToId], references: [id])
  dueDate       DateTime  @db.Date
  completedAt   DateTime?
  completedById String?
  completedBy   User?     @relation("InstanceCompleter", fields: [completedById], references: [id])
  notes         String?
  createdAt     DateTime  @default(now())
}

enum RecurrenceType { INTERVAL WEEKLY DATE_OF_MONTH ONE_OFF }
enum AssignmentMode { FIXED ROTATING }
enum Species        { DOG CAT BIRD RABBIT OTHER }
enum Weekday        { MONDAY TUESDAY WEDNESDAY THURSDAY FRIDAY SATURDAY SUNDAY }
```

### 7.7 Bins & Calendar

```prisma
model BinCollection {
  id                String         @id @default(uuid())
  name              String                              // "Burgundy bin"
  colour            String                              // hex for UI
  icon              String?
  recurrenceType    RecurrenceType
  intervalDays      Int?
  weekdays          Weekday[]
  dayOfMonth        Int?
  startDate         DateTime?      @db.Date              // anchor for biweekly
  remindNightBefore Boolean        @default(true)
  remindMorningOf   Boolean        @default(true)
  isActive          Boolean        @default(true)
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
}

model CustomEvent {
  id          String    @id @default(uuid())
  title       String
  description String?
  startTime   DateTime
  endTime     DateTime?
  allDay      Boolean   @default(false)
  colour      String?
  createdById String
  createdBy   User      @relation(fields: [createdById], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model CalendarSource {
  id           String              @id @default(uuid())
  name         String                                       // "Ben's Google"
  type         CalendarSourceType
  url          String                                       // iCal URL or HA entity
  colour       String
  isActive     Boolean             @default(true)
  lastSyncedAt DateTime?
  events       SyncedEvent[]
  createdAt    DateTime            @default(now())
}

model SyncedEvent {
  id          String          @id @default(uuid())
  sourceId    String
  source      CalendarSource  @relation(fields: [sourceId], references: [id])
  externalId  String                                       // dedupe key
  title       String
  description String?
  startTime   DateTime
  endTime     DateTime?
  allDay      Boolean         @default(false)

  @@unique([sourceId, externalId])
}

enum CalendarSourceType {
  ICAL
  HOME_ASSISTANT
}
```

### 7.8 Settings & Integration

```prisma
model HomeAssistantConfig {
  id              String    @id @default("singleton")   // enforce single row
  url             String
  accessToken     String                            // ENCRYPT AT REST
  isActive        Boolean   @default(true)
  lastConnectedAt DateTime?
  updatedAt       DateTime  @updatedAt
}

model DashboardLayout {
  id        String   @id @default(uuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  layout    Json                                      // react-grid-layout config
  widgets   Json                                      // enabled widgets + config
  updatedAt DateTime @updatedAt
}

model NotificationPreference {
  id                   String   @id @default(uuid())
  userId               String   @unique
  user                 User     @relation(fields: [userId], references: [id])
  binReminders         Boolean  @default(true)
  choreReminders       Boolean  @default(true)
  expiryWarnings       Boolean  @default(true)
  lowStockAlerts       Boolean  @default(true)
  petCareReminders     Boolean  @default(true)
  customEventReminders Boolean  @default(true)
  pushViaHA            Boolean  @default(true)
}

model ImmichConfig {
  id               String   @id @default("singleton")   // enforce single row
  url              String
  apiKey           String                                // ENCRYPT AT REST
  selectedAlbumIds String[]                              // empty = all photos
  isActive         Boolean  @default(true)
  lastConnectedAt  DateTime?
  updatedAt        DateTime @updatedAt
}

model IdleModeSettings {
  id                     String   @id @default("singleton")   // enforce single row
  // Singleton — household-wide settings for the shared wall tablet
  enabled                Boolean  @default(true)
  activationMinutes      Int      @default(5)             // inactivity threshold
  photoDisplaySeconds    Int      @default(30)            // per photo
  clockDisplaySeconds    Int      @default(120)           // 2 min default
  shufflePhotos          Boolean  @default(true)
  showWeatherInClockMode Boolean  @default(true)
  immichEnabled          Boolean  @default(true)          // turn off photos entirely if desired
  updatedAt              DateTime @updatedAt
}
```

---

## 8. Feature Specifications

### 8.1 Authentication & User Management

- **First run**: setup wizard creates the initial admin
  - Backend exposes `GET /api/setup/status` → `{ requiresSetup: boolean }`
  - If `true`, frontend routes to `/setup`, otherwise `/login`
  - One-time admin creation form, then redirects to login
- **Login**: username + password (argon2)
- **JWT**: signed with `jose`, returned via httpOnly cookie OR `Authorization: Bearer <token>`
- **Roles**: `ADMIN` (manage users, settings) vs `MEMBER` (use all features)
- **Admin dashboard**: create/edit/delete users
  - Members can edit their own profile (avatar, colour, password)
  - Members cannot change their own role
- **Profile fields**: username, first name, surname, avatar, colour, DOB

### 8.2 Tags

- Global tag entity reused across `Item`, `Recipe`, `Chore`
- Includes optional colour (hex) for visual chips
- Special tag name **`quick-add`** triggers UI behaviour (items appear in shopping list quick-add dropdown)
- New items prompt user for tags on creation (future: LLM auto-tag via Ollama)

### 8.3 Shopping Lists

- **Multi-list** — any user can create new lists ("Weekly Shop", "Aldi", "B&Q")
- **Items are reusable entities** — "Milk" exists once in DB
- **Quick-add dropdown** — populated by querying items with `quick-add` tag
- **Tick to mark bought** — `isBought=true`, `boughtAt=now()`. Items remain visible during shop
- **Show who added what** — display user's colour beside each item
- **Show categories** — visual grouping by tags during shop (dairy, frozen, etc.)
- **Archive flow** (the key UX moment):
  1. User clicks "Archive shopping list"
  2. Modal shows ticked items — per-item: storage location dropdown + optional expiry date → creates `PantryEntry` rows
  3. Modal shows unticked items — per-item "Roll over to new list?" toggle
  4. If any roll-overs selected → create new active list
  5. Original list status set to `ARCHIVED`
- **History preserved** — archived lists viewable for historical reference

### 8.4 Pantry

- **Custom storage locations** — user-creatable (Main Fridge, Garage Freezer, etc.)
- **Granular quantities** — Float + unit (500g flour, 2 bottles milk)
- **Separate entries per instance** — _2 bottles of milk = 2 PantryEntry rows_, allows distinct expiry dates
- **Expiry dates** — optional per entry, powers "expiring soon" widget
- **Low stock** — `Item.minimumQuantity` triggers alert when total pantry quantity (all entries converted to `Item.baseUnit`, see §9.2) drops below it
- **Manual edits** — users can adjust quantity directly (used some flour)
- **Recipe deduction** — opt-in: marking meal plan entry as "cooked" deducts ingredients from pantry

### 8.5 Recipes

- **URL import**:
  - User pastes URL → backend fetches → parses `<script type="application/ld+json">` for `@type: Recipe` (schema.org)
  - Library: `recipe-scraper` or custom parser
  - Populates title, description, image, ingredients, steps, times, servings
  - Stores `sourceUrl` for back-reference
- **Manual entry** — full form for creating from scratch
- **Ingredients linked to `Item`** — **this is critical**. Enables meal plan → shopping flow.
  - When user enters an ingredient name during import/edit, if Item doesn't exist, create one (prompt for tags)
  - URL import mints `Item` rows for everything, including non-shoppable staples ("salt", "water", "to taste"). Mark these `Item.isStaple = true` so they're kept for recipe fidelity but **excluded** from generate-shopping-list (§8.6)
- **Structured steps** — array of `RecipeStep` with order. Ticks during cooking on dashboard
- **Servings + scaling** — recipe stores default servings; meal plan can override; UI scales ingredient quantities accordingly

### 8.6 Meal Planning

- **Calendar-based** — entries are date + meal type
- **Flexible meal types** — `HouseholdSettings.enabledMealTypes` controls which appear in UI (default: just dinner)
- **Recipe OR custom label** — entry references a recipe OR has a `customLabel` ("Takeaway", "Leftovers")
- **Views**: weekly grid + monthly calendar
- **Killer feature: Generate Shopping List**

  ```
  POST /api/meal-plans/generate-shopping-list
  Body: { startDate, endDate, listName? }

  Logic:
    1. Fetch all MealPlanEntry between dates with linked recipes
    2. Sum all RecipeIngredient quantities per Item, scaled by
       (entry.servings ?? recipe.servings) / recipe.servings,
       converting each to Item.baseUnit (see §9.2)
    3. Query pantry: SUM(PantryEntry.quantity) per Item, converted to baseUnit
    4. Subtract pantry from required → shortfall per Item
       (rows whose unit can't convert to baseUnit are flagged, not summed;
        Items with isStaple=true are excluded entirely)
    5. Create new ShoppingList with ShoppingListItem rows for each shortfall
    6. Return new list ID
  ```

### 8.7 Chores & Cleaning

- **Four recurrence types**:
  - `INTERVAL` — every X days from last completion (e.g., worming every 30 days)
  - `WEEKLY` — specific weekdays (e.g., hoover every Saturday)
  - `DATE_OF_MONTH` — e.g., bill on the 1st. For `dayOfMonth` values that don't exist in a given month (29–31), **clamp to the last day of that month** (so 31 → 28/29 Feb, 30 Apr, etc.)
  - `ONE_OFF` — single deadline
- **Assignment modes**:
  - `FIXED` — same person every time
  - `ROTATING` — cycles through `rotatingUsers` list
- **Instance pattern** — `Chore` = template, `ChoreInstance` = occurrence
  - On completion of an instance: mark complete, generate next instance based on recurrence
- **Pet linkage** — `petId` optional; pet-related chores show on pet profile pages
- **Completion history** — full audit (who completed, when). Unlocks streak tracking and "pulling your weight" stats later.

### 8.8 Pet Care

- **Pet profiles**: name, species, breed, DOB, image
- **Treatment history**: Pet profile page shows all completed `ChoreInstance` rows for chores linked to that pet
- **Example chores**:
  - "Rex worming" — INTERVAL 30 days, petId: Rex
  - "Rex flea treatment" — INTERVAL 30 days, petId: Rex
  - "Defrost dog food" — INTERVAL 3 days, no petId (or generic Dog), rotating assignment

### 8.9 Bins

- **Manual entry in v1** (auto-scraping is a future enhancement, see §12)
- **Schedule example** (illustrative UK council kerbside collection):
  | Bin | Day | Frequency |
  |---|---|---|
  | Burgundy (food/garden) | Tuesday | Fortnightly |
  | Blue (paper/card) | Tuesday | 4-Weekly |
  | Black/Green (general) | Tuesday | Fortnightly |
  | Light Grey (glass/cans/plastics) | Tuesday | 4-Weekly |
- **Reminders** — per-bin toggles for night-before and morning-of
- **Dashboard widget** — "Next bin day" countdown with colour-coded bin icons

### 8.10 Calendar (Aggregated View)

- **Single endpoint** combines multiple sources:

  ```
  GET /api/calendar?start=2026-06-01&end=2026-06-30

  Aggregates from:
    - MealPlanEntry
    - ChoreInstance
    - BinCollection (computed from recurrence)
    - CustomEvent
    - SyncedEvent (external)

  Returns: Array<{
    id, source, title, startTime, endTime, allDay, colour, type, sourceData
  }>
  ```

- **Custom events** — free-form, user-created (date night, partner's mum visiting)
- **External sources**:
  - `ICAL` — fetch iCal URL on a schedule (cron job), parse with `node-ical`, populate `SyncedEvent`
  - `HOME_ASSISTANT` — query HA calendar entities via WebSocket/REST

### 8.11 Home Assistant Integration

- **Setup**: user pastes HA URL + long-lived access token into settings (encrypted at rest)
- **Connection**: persistent **WebSocket** connection from Express to HA
  - Uses `ws` library
  - Subscribes to entity state changes
  - Re-broadcasts relevant updates to frontend via Hame's own WebSocket layer (or Server-Sent Events)
- **Features exposed**:
  - Read entity states (lights, sensors, temperature, presence) for dashboard widgets
  - Control devices (toggle lights, run scenes, trigger automations)
  - Send notifications via HA (HA handles phone push)
  - Read HA calendars (added as a `CalendarSource`)
- **No state mirroring** — Hame queries HA live, doesn't duplicate entity data

### 8.12 Dashboard

- **Drag-and-drop layout** with `react-grid-layout`
- **Per-user layouts** stored in `DashboardLayout`
- **Widgets** (all in v1):
  - 🕐 Clock & greeting
  - 🌤️ Weather (via HA)
  - 🍽️ Today's meals
  - 🛒 Active shopping list (top items)
  - ✅ Today's chores
  - 🚮 Next bin day
  - 📅 Upcoming calendar events
  - ⚠️ Expiring soon (3-day window)
  - 📉 Low stock alerts
  - 💡 Smart home quick controls (lights/scenes)
  - 📶 WiFi QR code
  - 🐾 Pet reminders
- **Idle / wall-tablet mode** — see §8.14 for full screensaver behaviour (Immich photos + clock cycling)
- **PWA** — installable on tablet/phone home screen

### 8.13 Notifications

- **In-app toasts** — for events happening while user is active
- **Push via Home Assistant** — HA already handles phone push; Hame just sends events to HA, no duplicated notification infra
- **Per-user preferences** — `NotificationPreference` toggles each category

### 8.14 Immich Screensaver / Idle Mode

The wall-mounted tablet doubles as a digital photo frame when not in use, pulling photos from the household's self-hosted Immich library.

#### Cycle Behaviour

```
Idle activated (after activationMinutes inactivity)
        ↓
[Photo cycle — photoDisplaySeconds per image, random or sequential]
        ↓
[Clock mode — large clock + date + weather, for clockDisplaySeconds]
        ↓
[Photo cycle again]
        ↓
... loops until touch / motion wakes display
```

Smooth fade transitions between photos and modes. Touch wakes back to dashboard.

#### Immich API Integration

- **Auth**: API key in `x-api-key` header
- **Endpoints used**:
  - `GET /api/album` — list albums (for settings UI)
  - `GET /api/album/{id}` — fetch album with asset IDs
  - `GET /api/asset/file/{id}?format=PREVIEW` — fetch preview-sized image
- **Settings UI**: user picks which albums to include (empty = all photos)

#### Backend Proxy (Privacy)

Frontend never gets Immich credentials. Flow:

```
Frontend → GET /api/idle/next-photo
        → Hame backend selects random asset ID from configured albums
        → Hame backend fetches image from Immich using stored API key
        → Hame backend streams image bytes back to frontend
```

Benefits:

- Immich credentials stay server-side (same pattern as HA token)
- Works when Hame is accessed remotely without exposing Immich
- Backend can cache aggressively for performance

#### Configuration

- **`ImmichConfig`** — singleton: URL, encrypted API key, selected album IDs
- **`IdleModeSettings`** — singleton (household-wide, not per-user, because the wall tablet is shared and no one is actively logged in during idle):
  - `enabled` — kill switch
  - `activationMinutes` — default 5
  - `photoDisplaySeconds` — default 30
  - `clockDisplaySeconds` — default 120 (2 min)
  - `shufflePhotos` — default true
  - `showWeatherInClockMode` — default true
  - `immichEnabled` — toggle photos off, clock-only mode

#### Future Enhancements (mentioned in §12)

- _"On this day"_ — Immich photos from this date in previous years (EXIF-based)
- Orientation filtering (landscape-only for landscape display)
- Themed cycles (recent uploads, seasonal albums)
- Burn-in protection — subtle slow pan/zoom on photos (Ken Burns effect)

---

## 9. Architecture Patterns

### 9.1 Shared Zod Schemas

Schemas defined in `packages/shared/src/schemas/` are imported by:

- **Frontend**: React Hook Form validation + type inference (`z.infer<typeof UserSchema>`)
- **Backend**: Express request body validation middleware + Prisma input typing

Example:

```ts
// packages/shared/src/schemas/user.ts
import { z } from 'zod'
export const CreateUserSchema = z.object({
	username: z.string().min(3).max(30),
	password: z.string().min(8),
	firstName: z.string().min(1),
	surname: z.string().min(1),
	colour: z.string().regex(/^#[0-9a-f]{6}$/i),
	dob: z.coerce.date(),
})
export type CreateUserInput = z.infer<typeof CreateUserSchema>
```

### 9.2 Universal Item Entity

`Item` is referenced by `ShoppingListItem`, `PantryEntry`, and `RecipeIngredient`. This is the keystone that enables:

- Meal plan → automatic shopping list generation with pantry cross-reference
- "What can I cook with what I have?" queries
- Unified history of an item across shopping, pantry, recipes

#### Unit Normalisation (required for stock maths)

`PantryEntry`, `ShoppingListItem`, and `RecipeIngredient` each store a free-form `unit` **for display**, but any feature that **sums or subtracts** quantities across rows (low-stock alerts in §8.4, generate-shopping-list in §8.6) must first convert every quantity to the `Item.baseUnit`. Rules:

- `Item.baseUnit` is the canonical unit for that item (e.g. `g`, `ml`, `unit`).
- A small conversion map in `@hame/shared` (e.g. `kg→g ×1000`, `l→ml ×1000`, `pack`/`bottle`→`unit`) normalises display units to the base unit before any arithmetic.
- If a row's `unit` is **not convertible** to the item's `baseUnit` (or `baseUnit` is null), aggregation **excludes that row and surfaces a warning** rather than silently adding incompatible numbers. This prevents "500 g + 2 bottles = 502" bugs.
- `Item.minimumQuantity` is stored in `baseUnit`.

### 9.3 Tag System

Single `Tag` model used by `Item`, `Recipe`, `Chore`. Semantic tags like `quick-add` drive UI behaviour without schema rigidity.

### 9.4 Instance Pattern

Template + Occurrences:

- `Chore` (template) → `ChoreInstance` (each occurrence with completion status)
- Completion writes history, then auto-generates the next instance based on recurrence rules

This unlocks streak tracking, "pulling your weight" stats, and pet treatment history without additional models.

### 9.5 Aggregated Calendar Endpoint

Single API endpoint pulls from 5+ tables and returns unified events. No `Event` materialised table — querying live keeps data DRY.

### 9.6 Self-Correcting Bin Schedule (Future)

Future scraper anchors `BinCollection.startDate` weekly from council's "this week's collection" data. Handles bank holiday shifts without complex calendar logic — the council page is source of truth.

### 9.7 Type-Safe End-to-End

Prisma generates DB types → Express returns typed data → Zod validates inputs → React consumes typed responses. No `any` types anywhere in the codebase.

---

## 10. Build Roadmap

### Phase 0 — Foundation ✅ Complete (15-06-2026)

Monorepo setup, Vite + React + Tailwind + shadcn/ui scaffolded, Express + Prisma scaffolded, PostgreSQL container, Docker Compose, ESLint + Prettier, GitHub repo, initial Prisma schema with `User`, shared Zod package wired up.

**Goal**: `pnpm dev` brings up the full stack working together.

**Delivered**: pnpm workspace (`apps/web`, `apps/api`, `packages/shared`); Vite/React/Tailwind/shadcn web with TanStack Query; Express/Prisma API with env validation, error handling, `GET /api/setup/status` + `/api/health`; shared Zod schemas; PostgreSQL via Docker Compose (+ prod compose, Dockerfiles, nginx); GitHub Actions CI (lint, format, typecheck, test, build); Husky + lint-staged; initial Prisma migration + seed. Verified end-to-end: typecheck/lint/format/tests/builds green, DB migrated + seeded, live API smoke-tested.

### Phase 1 — Auth & Setup Wizard ✅ Complete (17-06-2026)

Setup wizard for first-run admin creation, login/logout, JWT middleware, protected routes, basic profile page, admin user management.

**Goal**: You can log in to Hame.

**Delivered**: First-run setup wizard (`POST /api/setup`, guarded so it only ever creates the first admin) and `/api/auth/{login,logout,me}`; argon2 password hashing with timing-equalised login failures; a single httpOnly **session cookie** signed with `jose`. The session **slides** on every authenticated request, with a **network-aware idle window** — on-LAN clients (private-range IP, no Cloudflare headers) get the long `JWT_REFRESH_EXPIRY` window so the wall tablet effectively never logs out, while off-LAN clients get the short `JWT_ACCESS_EXPIRY` window and re-authenticate sooner (`LOCAL_NETWORK_CIDRS` is the configurable boundary). Double-submit **CSRF** protection (readable token cookie + `x-csrf-token` header) on authenticated state-changing routes; `requireAuth`/`requireAdmin` middleware; user CRUD with self-delete and last-admin guards. Frontend: a bootstrap auth gate (setup → login → app, with an admin-only route guard), Setup/Login/Profile and admin Users pages built on shared Zod schemas, and a CSRF-aware API client. Verified end-to-end: typecheck/lint/format/tests/builds green (30 tests incl. the network-aware session and CSRF logic), plus a live API smoke test of the full setup → login → profile-edit → logout flow.

### Phase 2 — Daily-Use Foundation (MVP) ✅ Complete (18-06-2026)

Tag system, Item library, shopping lists (multi-list, quick-add, archive flow), storage locations + pantry, list-to-pantry flow, rollover logic, basic dashboard with shopping + pantry widgets.

**Goal**: You stop using paper for shopping. Hame is part of daily life.

**Delivered**: A single Phase 2 migration adding `Tag`, `Item`, `ShoppingList`, `ShoppingListItem`, `StorageLocation` and `PantryEntry` (with the `ListStatus` enum and `User` back-relations). Shared `@hame/shared` gains the unit-normalisation module (§9.2) — a display→base-unit conversion map (`g`/`ml`/`unit`) that excludes-and-flags incompatible units rather than summing them — plus Zod schemas for tags, items, shopping and pantry. API vertical slices (thin controllers, thick services) for tags, items (incl. `quick-add` filtering and find-or-create by name), storage locations, pantry (incl. expiring-soon and unit-aware low-stock), and shopping lists — the latter covering tick-to-buy, the archive→pantry flow and rollover-to-new-list inside a transaction with full validation. Frontend: TanStack Query hooks for every resource, a Hearth-styled dashboard (active-shopping, expiring-soon and low-stock widgets), a Shopping page (multi-list selector, quick-add with datalist, tag-grouped check rows, archive dialog) and a Pantry page (locations, stock entry, expiry chips). Verified end-to-end: typecheck/lint/format green, 48 tests pass (incl. unit conversion, archive guards and low-stock aggregation), web build clean, and a live API smoke test of the full create-list → add → tick → archive→pantry → rollover → widgets flow.

### Phase 3 — Chores, Pets & Reminders ✅ Complete (19-06-2026)

Pet CRUD, chore CRUD with all recurrence types, assignment/rotation, completion tracking, instance auto-generation, chore dashboard widget.

**Goal**: Pet care reminders out of your head.

**Delivered**: A single Phase 3 migration adding `Pet`, `Chore` and `ChoreInstance` (with the `RecurrenceType` / `AssignmentMode` / `Species` / `Weekday` enums, the `User` back-relations and the `Chore`↔`Tag` link). Shared `@hame/shared` gains a pure recurrence engine — `firstDueDate` / `nextDueDate` covering all four recurrence types, with day-of-month clamping (31 → 28/29 Feb, 30 Apr) and INTERVAL counting from the completion date while WEEKLY / DATE_OF_MONTH advance from the scheduled due date — plus Zod schemas for pets and chores whose cross-field refinement enforces each recurrence type's required field and each assignment mode's assignee(s). API vertical slices (thin controllers, thick services) for pets and chores implement **event-driven instance generation**: the opening occurrence is created with the chore, the next is generated on completion inside a transaction with the rotation advanced round the household, plus an `uncomplete` undo, schedule-change reconciliation on edit, a `GET /api/chore-instances?due=today` feed for the dashboard, per-pet treatment-history assembly, and a non-sensitive `GET /api/users/members` roster so members can assign chores without admin access. Frontend: TanStack Query hooks for every resource, a Chores page (due-now / upcoming split, circle check-rows per design §6, a recurrence-aware create/edit form), a Pets page and per-pet profile with a treatment-history timeline and the Hearth photo placeholder, and Today's-chores + Pet-reminders dashboard widgets wired into the nav and home grid. Verified end-to-end: typecheck / lint / format green, 67 tests pass (incl. the recurrence engine's clamping/rotation cases and the chore-service generation/rotation/guards), web build clean, and a live API smoke test of the full create-pet → create-rotating-chore → today-feed → complete → next-instance-with-rotation-advanced → pet treatment-history flow.

### Phase 4 — Recipes & Meal Planning ⭐

Recipe CRUD (manual + URL import via schema.org), meal plan calendar (week + month), serving scaling, meal-type complexity toggle in settings, generate-shopping-list flow.

**Goal**: One button: "Generate shopping list for this week."

### Phase 5 — Bins, Calendar & Events

Bin schedules (manual), custom events, iCal sync, aggregated calendar endpoint, FullCalendar component.

**Goal**: One place to see everything happening.

### Phase 6 — Home Assistant Integration

HA config UI, WebSocket client, entity state reads, device controls, HA calendar source, real-time dashboard updates.

**Goal**: Smart home from Hame, live sensor data on dashboard.

### Phase 7 — Dashboard Polish

All remaining widgets, drag-and-drop customisation, per-user layouts, **idle mode with Immich photo screensaver + clock cycling**, responsive layouts, PWA.

**Goal**: Hame on the wall tablet looks beautiful, and turns into a digital photo frame when idle.

### Phase 8 — Notifications

In-app toasts, per-user preferences, push via HA, streak tracking & stats.

**Goal**: Reminders reach you when away from dashboard.

### Phase 9 — Polish & Portfolio Prep

Comprehensive README, demo data seed script, architecture diagrams, tests for critical flows, production Docker setup, blog post draft.

**Goal**: CV-ready, link-able from portfolio.

---

## 11. Security & Conventions

### Security

- **Password hashing**: argon2 (current best practice)
- **JWT**: signed with strong secret from env, short expiry + refresh tokens
- **HA access token**: encrypted at rest using AES-256-GCM with key from env
- **Middleware**:
  - `helmet` for security headers
  - `cors` locked to allowed origins
  - `express-rate-limit` on `/api/auth/*` endpoints (5 attempts / 15 mins per IP)
- **Trust proxy / real client IP**: the app sits behind Cloudflare + a reverse proxy, so Express must set `trust proxy` correctly and derive the client IP from `CF-Connecting-IP`. Otherwise every request appears to come from a proxy IP and the per-IP rate limit collapses into a single shared bucket. Do **not** blindly trust `X-Forwarded-For` (spoofable) — pin to the known proxy.
- **CSRF**: because JWT is stored in an httpOnly cookie, cookie-based requests need CSRF protection — set `SameSite=Lax` (or `Strict`) on the auth cookie and add a double-submit CSRF token for state-changing routes. (Bearer-token requests are exempt.)
- **Env vars** validated at startup with Zod — fail fast if misconfigured
- **No secrets in git** — `.env.example` documents required vars
- **httpOnly cookies** for JWT preferred over localStorage

### Code Conventions

- **TypeScript strict mode** enabled
- **No `any`** — use `unknown` and narrow, or fix the type
- **ESLint + Prettier** enforced via pre-commit hook (Husky + lint-staged)
- **Controllers thin, services thick** — controllers do HTTP, services do business logic
- **Async/await** over Promise chains
- **Error handling**: centralised Express error middleware, never silent catches

### Database

- **Prisma migrations**: `prisma migrate dev` during development creates named migrations
- **Each phase = its own migration(s)** — clean migration history showing project evolution
- **Seed script** at `apps/api/prisma/seed.ts` populates demo data for cloners

---

## 12. Future Enhancements

### LLM Auto-Tagging

- Self-hosted **Ollama** on TrueNAS
- On new Item creation, prompt LLM with item name → suggested tags from existing tag pool
- User confirms/edits before save
- Endpoint: `POST /api/items/suggest-tags`

### UK Bin Scraper (Separate Repo)

- Standalone repo: `uk-bin-scraper`
- Modular per-council scraper pattern:
  ```
  /scrapers
    /council-a.ts
    /council-b.ts
    /council-c.ts
  ```
- Common interface (e.g., `parseSchedule(streetUrl: string): Schedule[]`)
- Hame integrates by calling the scraper as a library
- Cron job refreshes weekly, anchors `BinCollection.startDate`
- Blog post: _"How I Scraped My Council's Website to Automate Bin Reminders"_

### Other Down-the-Line Features

- Budget & bill tracking
- Energy monitoring widget (HA energy data)
- Notes (could replace Memos)
- Home maintenance log (boiler service, MOT etc.)
- Document storage (warranties, manuals)
- Birthday reminders (DOB already in User model)
- "Pulling your weight" stats dashboard
- Streak tracking gamification
- Family announcement / notice board widget

### Deferred Decisions

Choices intentionally left open, to revisit when the need is real:

- **Rotating-chore order (Phase 3).** A rotating chore stores its people as an unordered set, so "whose turn is next" currently cycles by member account-creation date — deterministic and fair, but not hand-pickable. If a household ever wants to choose the sequence explicitly, this needs an ordered join (e.g. a `position` column on the rotation), not the implicit many-to-many. Not worth the extra model for a two-person household today.

---

## 13. Portfolio Framing

### What Hame Demonstrates

- **Full-stack TypeScript** — same language across frontend, backend, shared
- **Type safety end-to-end** — Prisma → Express → React, no `any`
- **Modern React patterns** — TanStack Query, Zustand, React Hook Form, shadcn/ui
- **Real-world architecture** — monorepo, shared schemas, controllers/services split
- **WebSocket bidirectional integration** — Home Assistant real-time
- **PostgreSQL relational modelling** — 24 connected models, real joins
- **Self-hosted deployment** — Docker, runs on user's own hardware
- **A genuine problem solved** — not a tutorial clone, an actual household app

### Talking Points for Interviews

- _"I built Hame because juggling Mealie + Grocy + Vikunja was painful. Building it custom let me tie features together — meal plan auto-generates a shopping list, checking pantry first."_
- _"WebSocket integration with Home Assistant gives real-time smart home control from the dashboard."_
- _"Shared Zod schemas in a monorepo mean form validation on the frontend and request validation on the backend use the same source of truth."_
- _"The Scots word 'Hame' just means home — felt right for a household app."_

### Portfolio Deliverables

- GitHub repo with strong README (screenshots, architecture diagram, quickstart)
- Demo video showing meal plan → shopping list → archive → pantry flow
- Blog post about the build journey
- Separate repo for UK bin scraper (additional portfolio piece)

---

## 14. Glossary

| Term                  | Meaning                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Hame**              | Scots for "home" — the app's name                                                                 |
| **Item**              | A reusable product entity (e.g., "Milk") referenced by shopping, pantry, recipes                  |
| **Tag**               | Global label applied to Items, Recipes, or Chores; some have semantic meaning (e.g., `quick-add`) |
| **Quick-add**         | Special tag making an Item appear in shopping list quick-add dropdown                             |
| **Instance**          | An occurrence of a recurring entity (e.g., this Saturday's hoover chore)                          |
| **Rollover**          | Moving an unbought shopping item from an archived list to a new one                               |
| **Storage Location**  | A user-defined place where pantry items live (Main Fridge, Garage Freezer)                        |
| **PWA**               | Progressive Web App — installable from browser, no app store needed                               |
| **HA / HAOS**         | Home Assistant / Home Assistant OS                                                                |
| **Immich**            | Self-hosted photo library; Hame pulls from it for screensaver mode                                |
| **Idle Mode**         | Wall-tablet screensaver: cycles Immich photos and a clock screen on inactivity                    |
| **Schema.org Recipe** | Structured data standard most recipe sites embed; used for URL import                             |

---

_Document last updated: design phase complete (incl. Immich screensaver integration), ready for implementation._
