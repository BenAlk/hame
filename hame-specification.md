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
| Calendar UI    | Custom grid (date-fns) | Hand-built to the Hearth design; FullCalendar dropped as off-brand — see §10 Phase 5 |
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

All models defined in `apps/api/prisma/schema.prisma`. The full design below spans 28 models; those through Phase 5.6 are built, with the §7.8 integration singletons (Home Assistant, Immich, dashboard, notifications, idle mode) landing in Phases 6–8 and the `Integration` / `IntegrationEvent` pair in Phase 10.

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
  calendarObjects        CalendarObject[]         // was customEventsCreated; CustomEvent absorbed into CalendarObject in Phase 5.5
  calDavCredentials      CalDavCredential[]       // Phase 5.5
  dashboardLayout        DashboardLayout?         // Phase 7
  notificationPrefs      NotificationPreference?  // Phase 8
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
  typicalUnitGrams Float?                       // grams of one countable unit (1 onion ≈ 110g) — see §10 Phase 4.5
  minimumQuantity Float?                        // triggers low stock (expressed in baseUnit)
  isStaple        Boolean             @default(false)  // pantry staple (salt, water) — excluded from generated shopping lists
  isConsumable    Boolean             @default(false)  // household consumable (loo roll, foil, dishwasher tabs) — surfaced as a re-order checklist (§8.3); not expiry- or recipe-tracked
  reorderIntervalDays Int?                             // rough re-order cadence (days); drives the "probably due" highlight (§8.3)
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
  sources          ShoppingItemSource[]  @default([MANUAL])  // distinct channels merged into this line — drives the ×N badge (§8.3)
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

enum ShoppingItemSource {
  MANUAL                                         // typed / quick-add
  MEAL_PLAN                                      // generate-shopping-list (§8.6)
  CONSUMABLES                                    // the consumables checklist (§8.3)
  ROLLOVER                                       // carried from an archived list
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
  mealTypes       MealType[]                                    // slots this recipe can auto-fill when generating a plan (§8.6); empty = never auto-picked
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
  isGenerated Boolean    @default(false)               // written by the meal-plan generator (§8.6); manual entries stay false and are never overwritten by a re-generate
  createdById String
  createdBy   User       @relation(fields: [createdById], references: [id])
  createdAt   DateTime   @default(now())
}

model HouseholdSettings {
  id                   String             @id @default("singleton")   // enforce single row
  enabledMealTypes     MealType[]         @default([DINNER])
  ingredientNormaliser NormaliserStrategy @default(BASIC)             // §10 Phase 4.5
  updatedAt            DateTime           @updatedAt
}

enum MealType {
  BREAKFAST
  LUNCH
  DINNER
  SNACK
}

enum NormaliserStrategy {
  BASIC                                          // regex parser only (default, zero setup)
  DICTIONARY                                     // + bundled lookup table
  LLM                                            // + batched Ollama pass, degrades to dictionary
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
  id                String          @id @default(uuid())
  name              String                              // "Burgundy bin"
  colour            String                              // hex for UI
  icon              String?
  sourceType        BinSourceType   @default(MANUAL)    // where dates come from — §8.9, §10 Phase 5.6
  sourceConfig      Json?                               // provider details for external sources (null for MANUAL)
  lastSyncedAt      DateTime?                           // last successful external sync (null for MANUAL)
  recurrenceType    RecurrenceType?                     // MANUAL schedule; null for external sources
  intervalDays      Int?
  weekdays          Weekday[]
  dayOfMonth        Int?
  startDate         DateTime?       @db.Date            // anchor for biweekly
  remindNightBefore Boolean         @default(true)
  remindMorningOf   Boolean         @default(true)
  isActive          Boolean         @default(true)
  occurrences       BinOccurrence[]                     // cached dates for external sources
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

model BinOccurrence {
  // A concrete collection date cached from an external bin source (§10 Phase 5.6).
  // MANUAL bins don't use this — their dates are computed live. Each sync replaces
  // a bin's rows wholesale, so the cache always reflects the source.
  id        String        @id @default(uuid())
  binId     String
  bin       BinCollection @relation(fields: [binId], references: [id], onDelete: Cascade)
  date      DateTime      @db.Date
  createdAt DateTime      @default(now())

  @@unique([binId, date])
}

enum BinSourceType {
  MANUAL                                         // recurrence engine (default, zero setup)
  ICAL                                           // a council iCal feed
  SCRAPER                                        // the uk-bin-scraper library (§12)
  HOME_ASSISTANT                                 // HA bin sensors (Phase 6)
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

model OllamaConfig {
  // Singleton (§10 Phase 4.5) — Ollama server for the LLM ingredient normaliser.
  // Homelab Ollama is unauthenticated, so there is no token to encrypt.
  id              String    @id @default("singleton")
  url             String?
  model           String    @default("llama3.1")
  isActive        Boolean   @default(false)
  lastConnectedAt DateTime?
  updatedAt       DateTime  @updatedAt
}

model DashboardLayout {
  id          String   @id @default(uuid())
  userId      String?  @unique                        // null only for the shared household/tablet row
  user        User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  isHousehold Boolean  @default(false)                // one fixed-id "household" row (the wall tablet, §8.14)
  layout      Json                                    // react-grid-layout config (per breakpoint)
  widgets     Json                                    // enabled widgets + config
  updatedAt   DateTime @updatedAt
}

model NotificationPreference {
  id                   String   @id @default(uuid())
  userId               String   @unique
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  binReminders         Boolean  @default(true)
  choreReminders       Boolean  @default(true)
  expiryWarnings       Boolean  @default(true)
  lowStockAlerts       Boolean  @default(true)
  petCareReminders     Boolean  @default(true)
  customEventReminders Boolean  @default(true)
  pushViaHA            Boolean  @default(true)             // master switch for HA phone push
  haNotifyService      String?                             // user's notify.* target; null = no phone picked
  criticalAlerts       Boolean  @default(false)            // opt-in iOS critical / high-priority alert
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
  showBinsInIdle         Boolean  @default(true)          // rotate in a "bin due today/tomorrow" screen
  showMealsInIdle        Boolean  @default(true)          // rotate in today's meal for the current slot
  updatedAt              DateTime @updatedAt
}

model Integration {
  // A configured instance of an IntegrationProvider (§9.9, §10 Phase 10).
  id                  String             @id @default(uuid())
  providerId          String                                  // registry key: "gitea", "truenas"
  kind                IntegrationKind                          // matches the provider's declared kind
  name                String                                   // user label: "Homelab NAS", "Gitea"
  config              Json                                     // non-secret provider config (url, owner/repo, poll interval…)
  secret              String?                                  // provider secret, AES-256-GCM ENCRYPTED AT REST (§11); null if none needed
  isActive            Boolean            @default(true)
  pollIntervalSeconds Int                @default(900)         // per-instance refresh cadence
  snapshot            Json?                                    // last successful STATUS payload (normalised metrics) — rendered by the generic status widget
  events              IntegrationEvent[]                       // cached CALENDAR events (empty for STATUS)
  lastSyncedAt        DateTime?                                // last successful poll (null until first)
  lastError           String?                                  // last failure; cleared on next success (graceful-degrade, §9.6)
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
}

model IntegrationEvent {
  // A dated event cached from a CALENDAR-kind integration — the BinOccurrence
  // mould (§7.7). Each poll replaces a source's rows wholesale, so the cache
  // always reflects the source, and the aggregated calendar (§9.5) unions these
  // in alongside every other source.
  id            String      @id @default(uuid())
  integrationId String
  integration   Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  externalId    String                                        // dedupe key within the source
  title         String
  startTime     DateTime
  endTime       DateTime?
  allDay        Boolean     @default(false)
  createdAt     DateTime    @default(now())

  @@unique([integrationId, externalId])
}

enum IntegrationKind {
  STATUS                                                       // point-in-time metrics → dashboard tile
  CALENDAR                                                     // dated events → aggregated calendar
  // FEED (ordered list) is deferred; ACTION/control is a non-goal — see §12
}

model BackupSettings {
  // Automated on-disk backup schedule (§8.15, §10 Phase 8.9). Singleton extending
  // the manual export/import (§8.8): a scheduled job seals the same passphrase-
  // encrypted envelope and writes it to the host-mounted BACKUP_DIR with rolling
  // retention, so backups survive a dead container or database. The schedule lives
  // here (not a cron env) so an hourly tick reads it and a pure `isBackupDue`
  // decides — catching up a run missed while the container was down.
  id             String           @id @default("singleton")
  enabled        Boolean          @default(false)
  frequency      BackupFrequency  @default(DAILY)
  hour           Int              @default(3)                  // hour-of-day (UTC / container time)
  weekday        Int              @default(0)                  // 0=Sun … 6=Sat, for WEEKLY
  retentionCount Int              @default(7)                  // rolling max; oldest pruned past this
  passphrase     String?                                       // AES-256-GCM ENCRYPTED AT REST (§11); never returned — a scheduled run has no human to type one
  lastRunAt      DateTime?
  lastStatus     BackupRunStatus?
  lastError      String?
  updatedAt      DateTime         @updatedAt
}

enum BackupFrequency {
  DAILY
  WEEKLY
}

enum BackupRunStatus {
  SUCCESS
  FAILURE
}
```

### 7.9 QuickNotes

```prisma
model Note {
  // QuickNotes (§8.16, §10 Phase 11) — the household "fridge board": short,
  // glanceable notes shown on dashboards and the wall-tablet screensaver, either
  // household-wide or as a private direct note to one member. Ephemeral by design
  // — an optional expiry ages them out (pinned notes never expire) and a nightly
  // sweep hard-deletes past-expiry rows — so the board never accretes clutter.
  id          String       @id @default(uuid())
  authorId    String
  author      User         @relation("NoteAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  body        String                                     // the note text (short; ≤280 chars, enforced by Zod)
  audience    NoteAudience @default(HOUSEHOLD)
  recipientId String?                                    // set only for DIRECT — the one member it's for
  recipient   User?        @relation("NoteRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  colour      String?                                    // sticky tint (hex); null = inherit the author's User.colour
  pinned      Boolean      @default(false)               // sorts to top; exempt from expiry
  expiresAt   DateTime?                                  // null = never (pinned, or an explicit "keep")
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  acks        NoteAck[]

  @@index([audience, recipientId])
}

model NoteAck {
  // Per-user read/dismiss state for a note. A row means "this user has seen it";
  // `dismissed` hides a household note from that user's own board without removing
  // it for anyone else. Also powers the sender's "seen" indicator on a direct note.
  id        String   @id @default(uuid())
  noteId    String
  note      Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  dismissed Boolean  @default(false)
  seenAt    DateTime @default(now())

  @@unique([noteId, userId])
}

enum NoteAudience {
  HOUSEHOLD                                              // everyone's board + the wall-tablet screensaver
  DIRECT                                                 // one member only; never shown on the shared tablet
}
```

`NotificationPreference` (§7.8) gains a `directNoteAlerts Boolean @default(true)` toggle for the direct-note push (§8.16).

---

## 8. Feature Specifications

### 8.1 Authentication & User Management

- **First run**: setup wizard creates the initial admin
  - Backend exposes `GET /api/setup/status` → `{ requiresSetup: boolean }`
  - If `true`, frontend routes to `/setup`, otherwise `/login`
  - One-time admin creation form, then redirects to login
  - **Setup token** (§10 Phase 1.1) — the wizard is open until it's completed, so a
    publicly-reachable instance could be claimed by whoever loads `/setup` first. To
    close that land-grab, the server mints a **one-time token at first-run boot**
    (when the DB has no users), prints it to the logs, and `POST /api/setup` requires
    it back (constant-time check). The token is **in-memory only** (no DB row, no
    migration); a restart mid-setup mints a fresh one, and it's cleared once the admin
    exists. The operator reads it from the container logs (`docker logs hame-api`),
    proving they control the box.
- **Login**: username + password (argon2)
- **JWT**: signed with `jose`, returned via httpOnly cookie OR `Authorization: Bearer <token>`
- **Roles**: `ADMIN` (manage users, settings) vs `MEMBER` (use all features) vs `TABLET` (shared wall-tablet login — member-level, non-person; §10 Phase 7.5)
- **Wall-tablet account** (§10 Phase 7.5) — a first-class `TABLET` role: a shared, non-admin login for the wall tablet. Member-level permissions (so it can't reach settings/admin surfaces), but **not a household person** — excluded from assignment rosters, notifications and chore stats, and with no personal dashboard. It exists so the tablet can page through **every** member's dashboard read-only (the dashboard switcher, §8.12) without borrowing a real member's login.
  One is auto-provisioned alongside the admin at first-run setup (its generated password shown once), and re-issuable under Settings → Users.
  - **Optionally named.** The tablet has **no name** by default, because it isn't a person: the dashboard greeting simply reads "Good evening." rather than addressing the account's placeholder profile fields. An admin can give it one under Settings → Users (stored as the account's `firstName`, so it then reads exactly like a member's — the greeting, and wherever the tablet is credited for something it did, e.g. a QuickNote it posted); clearing it returns to the nameless greeting. The greeting always follows the **signed-in account**, not the dashboard being viewed, so paging the tablet through a member's board doesn't start greeting that member.
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
- **Consumables** (household re-order checklist) — non-perishable, non-recipe household goods (loo roll, kitchen roll, foil, washing-up liquid, dishwasher tabs, sugar) that aren't expiry- or recipe-tracked but still fill a shop. Modelled as `Item.isConsumable` (mirrors `isStaple`), **not** a separate list.
  - **Consumables page** — the curated list is every `Item` with `isConsumable`. A find-or-create input adds an item _and_ auto-sets the flag in one gesture; removing just unsets it (the `Item` and its history survive). An optional per-item `reorderIntervalDays` (re-order cadence) is captured here; it drives the "probably due" highlight (§10 Phase 8.4) and, behind an opt-in Labs toggle, can be **estimated automatically from purchase history** (§10 Phase 8.5).
  - **"Add consumables" panel** (always available on the Shopping page) — a checklist beside the current list; ticking adds an ordinary `ShoppingListItem` (using the item's `defaultQuantity`/`defaultUnit`, source `CONSUMABLES`). Items already on the list show ticked/greyed. Each row shows **"last bought N days ago"**, derived live from the most recent `boughtAt` across archived lists — no new tracking.
- **Merge badge** — when the same `Item` reaches a list from more than one channel (manual, meal-plan generate, consumables, rollover) its quantities **sum** into one line (base units, §9.2) and the line's `sources` set unions. A small circle **×N** badge (N = distinct sources, max 4) flags it, so a summed quantity is easy to sanity-check.

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
  Body: { startDate, endDate, targetListId?, listName? }

  Logic:
    1. Fetch all MealPlanEntry between dates with linked recipes
    2. Sum all RecipeIngredient quantities per Item, scaled by
       (entry.servings ?? recipe.servings) / recipe.servings,
       converting each to Item.baseUnit (see §9.2)
    3. Query pantry: SUM(PantryEntry.quantity) per Item, converted to baseUnit
    4. Subtract pantry from required → shortfall per Item
       (rows whose unit can't convert to baseUnit are flagged, not summed;
        Items with isStaple=true are excluded entirely)
    5. Fold the shortfall into the target list — the most-recently-updated
       ACTIVE list by default, or a new list when requested (Body
       `targetListId` / `listName`). Where an Item is already on the target
       list, SUM into the existing line (base units, §9.2) and union
       `MEAL_PLAN` into its `sources`; otherwise add a new ShoppingListItem
       (source `MEAL_PLAN`).
    6. Return the target list ID
  ```

- **Two-panel generate modal** — left: the generated food list; right: the **consumables checklist** (§8.3, same "last bought N days ago" hints). Ticked consumables fold into the target list alongside the food shortfall (any already on it are pre-ticked); unticking excludes them, with nothing persisted until confirm. This is why generate now **folds into a target list** rather than always minting a new one — one evolving list, with the ×N merge badge (§8.3) flagging anything summed from more than one source.
- **Generate Meal Plan** (§10 Phase 8.7) — fill a week's slots with random recipes, steered by tags. A recipe is eligible for a slot only when its `Recipe.mealTypes` includes that meal type (breakfast recipes land only in breakfast, etc.), set per recipe on its form. Optional per-meal-type **tag quotas** ("a roast dinner ×2") pin how many days carry a tag; the rest fill at random, preferring non-quota recipes for variety. The roll is a **pure, deterministic engine** (`generateMealPlan` in `@hame/shared`) run client-side for an instant **preview** with per-day and whole-week **reroll**; only on confirm does `POST /api/meal-plans/generate` persist the picks. Generated entries carry `MealPlanEntry.isGenerated = true`; a **manual entry locks its slot** and is never overwritten — a re-generate only replaces prior auto-picks and fills empty slots. A **Clear week** action (`POST /api/meal-plans/clear`) wipes the viewed week (manual and generated alike) to start from scratch.

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
- **Completing at the wall tablet** (§10 Phase 7.5) — the tablet account isn't a person, so ticking a chore from it opens a **"who completed this?"** member picker and credits the chosen member (a signed-in member's own completions are credited to them, no prompt). The completion endpoint takes an optional `completedById` and enforces that the credited completer is a real household member.

### 8.8 Pet Care

- **Pet profiles**: name, species, breed, DOB, image
- **Treatment history**: Pet profile page shows all completed `ChoreInstance` rows for chores linked to that pet
- **Example chores**:
  - "Rex worming" — INTERVAL 30 days, petId: Rex
  - "Rex flea treatment" — INTERVAL 30 days, petId: Rex
  - "Defrost dog food" — INTERVAL 3 days, no petId (or generic Dog), rotating assignment

### 8.9 Bins

- **Pluggable sources** (`BinCollection.sourceType`, §10 Phase 5.6) — a bin's collection dates come from one of:
  - `MANUAL` — typed recurrence schedule, computed by the recurrence engine (the default, zero setup; the v1 behaviour).
  - `ICAL` — a council iCal feed.
  - `SCRAPER` — the standalone `uk-bin-scraper` library (§12).
  - `HOME_ASSISTANT` — HA bin sensors (Phase 6).
  - The display layer (colour, icon, reminders, the widget) is identical across sources; only where the dates come from changes. External sources cache concrete dates (`BinOccurrence`) and **self-correct** on each sync (§9.6), so a bank-holiday shift just appears. **All four sources are wired** — `MANUAL`, `ICAL` and `SCRAPER` (§10 Phase 5.6) and `HOME_ASSISTANT` (§10 Phase 6.4) — all behind one interface.
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
- **Dashboard switcher** (§10 Phase 7.5) — from any device you can view Household or any member's dashboard; **editing is limited to your own and the household layout** (others are read-only). The shared wall tablet uses this via the `TABLET` account (§8.1) to page through everyone's dashboards.
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
- **Critical alerts are delivered, not guaranteed** — the household alert (§10 Phase 12) is sent as a critical push, but whether it *sounds* through a silenced phone is decided entirely by the receiving handset. Hame sends both platforms' keys — `push.sound.critical` (iOS) and `ttl: 0` / `priority: high` / `channel: alarm_stream` / `importance: high` (Android) — and there the app's control ends. Two consequences worth holding onto: **Android locks a notification channel's importance and sound the first time that channel is created**, honouring only a later *lowering*, so `importance` must be claimed on the first push or that device is permanently stuck at the weaker default; and overriding Do Not Disturb is a per-channel permission Android refuses to let an app self-grant. Both are therefore **per-device setup steps, documented for end users in the README**, not something a code change can fix.

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
[Bins screen — a bin due today/tomorrow, 20s]      (only when one is due)
        ↓
[Meal screen — today's meal for the current slot, 20s]  (only when planned)
        ↓
[Photo cycle again]
        ↓
... loops until touch / motion wakes display
```

Smooth fade transitions between photos and modes. Touch wakes back to dashboard.

**Info screens (conditional).** Two optional screens join the rotation only when
they have content at that moment, so an empty one is skipped rather than shown blank:

- **Bins** (`showBinsInIdle`, 20s) — a stylised full-screen reminder when a bin is
  due **today or tomorrow** (`nextCollection ∈ {today, tomorrow}`, so a Thursday
  collection shows Wednesday and Thursday only; leads with today's when both).
  A colour-coded wheelie bin per due collection, under an "Out today / tomorrow"
  headline.
- **Meals** (`showMealsInIdle`, 20s) — today's meal for the current time-of-day
  slot (breakfast 06:00–10:00, lunch 10:00–14:00, dinner 14:00–20:00; nothing
  otherwise), shown only when one is planned. Full-bleed recipe photo + title,
  falling back to a stylised typographic card for a custom label ("Takeaway") or
  an image-less recipe.

Both reuse existing data (the bins and meal-plan endpoints) — no new backend. The
clock stays the guaranteed fallback, so with photos off and nothing else to show
it remains clock-only.

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
  - `showBinsInIdle` — default true; the conditional bin-reminder screen
  - `showMealsInIdle` — default true; the conditional today's-meal screen

#### Future Enhancements (mentioned in §12)

- _"On this day"_ — Immich photos from this date in previous years (EXIF-based)
- Orientation filtering (landscape-only for landscape display)
- Themed cycles (recent uploads, seasonal albums)
- Burn-in protection — subtle slow pan/zoom on photos (Ken Burns effect)

---

### 8.15 Backup & Restore (Data Integrity)

If the server dies, Hame must not take the household's data with it. A full
**export/import** lets a household recover onto fresh hardware, migrate servers,
or keep off-box backups — and, because Hame stores **no on-disk file assets**
(avatars and recipe images are URLs; Immich photos are proxied live, §8.14), a
backup is purely the PostgreSQL rows: **one self-contained file, no asset
bundle**.

Two tiers, two audiences:

- **Logical export/import (the in-app feature).** An admin-only **Settings →
  Data** panel with an **Export** (download) and **Import** (restore) action.
  This is the portable, self-service path — no shell, no Postgres tooling — and
  is what Hame builds.
- **`pg_dump` / `pg_restore` (documented, not built).** The README carries an
  ops-grade section: a bit-exact physical dump plus the Compose volume, for when
  the operator _does_ have shell access. Belt-and-braces disaster recovery
  alongside the logical feature.

#### The export file — passphrase-encrypted and re-keyable

The file is deliberately **decoupled from the instance's `ENCRYPTION_KEY`** so a
backup restores onto a new box even if its key differs. On **Export** the admin
supplies a **passphrase** (entered twice); the server then:

1. Reads every table via Prisma (all rows, original **UUIDs preserved**).
2. **Decrypts** the three AES-GCM secret fields — `HomeAssistantConfig.accessToken`,
   `ImmichConfig.apiKey`, `WifiConfig.password` — from their at-rest ciphertext
   back to plaintext, so they no longer depend on the source key. (User and
   CalDAV **argon2 hashes are one-way and travel verbatim** — nothing to re-key.)
3. Assembles the payload: a **manifest** (backup-format version, the applied
   migration name, timestamp, per-table row counts) plus the `tables` data.
4. Derives a 32-byte key from the passphrase with **argon2id** (reusing the
   existing `argon2` dependency — no new lib) and a random salt, then
   **AES-256-GCM** encrypts the whole payload.

The output is a small JSON **envelope**: a clear header (format version, KDF algo
+ salt + params, IV) plus ciphertext and auth tag. Without the passphrase the
file is opaque — which also protects the password hashes inside it. GCM's auth
tag doubles as passphrase verification: a wrong passphrase fails cleanly
("incorrect passphrase or corrupt file") rather than yielding garbage.

#### The import — wipe-and-replace into a matching version

On **Import** the admin uploads the file and enters the passphrase:

1. Derive the key, AES-GCM **decrypt** (this verifies the passphrase), parse.
2. **Version gate** — the manifest's migration name must exactly match this
   instance's latest applied migration (read from `_prisma_migrations`). A
   mismatch is **refused** with a clear message; cross-version transforms are
   explicitly out of scope for v1 (restore into a matching build).
3. **Confirm-gate** — "this erases all current data."
4. In **one transaction**: wipe every table (reverse FK order), then insert all
   rows preserving their UUIDs (FK order). Any failure rolls back, leaving the
   instance untouched.
5. **Re-encrypt** the three secret fields under _this_ instance's
   `ENCRYPTION_KEY` before write, so they are correctly at-rest for the new box.
6. Sanity-check restored row counts against the manifest, then **reconnect live
   integrations** (bounce the HA WebSocket, reload the config singletons) so
   restored settings take effect without a process restart.

#### Access & safety

Export and import are **admin-only**, CSRF-protected, and rate-limited (both are
heavy). Because the export _is_ Hame's own JSON envelope, **import is a plain
`POST` with the envelope as the body** (a raised body limit scoped to the route)
— no file-upload middleware, keeping the dependency-light leaning. The file
carries password hashes and the decrypted integration secrets, so it is
**always** passphrase-encrypted; the app warns to store it somewhere safe.

#### Automated on-disk backups (§10 Phase 8.9)

The manual export above is pull-only — a human clicks **Download**. Phase 8.9 adds
a **scheduled producer of the same envelope**, written server-side so a household
that never remembers to click still has recent backups, and so those backups
**survive a dead container or database**. It's an extension, not a rewrite:
`exportBackup` is reused verbatim; only the sink and the trigger are new.

- **Where — a host bind-mount.** Files are written to `BACKUP_DIR`, which in
  production is a **directory on the host** bind-mounted into the API container
  (`${BACKUP_DIR_HOST}:/data/backups`). This is the crux of "accessible even if
  the container or DB corrupts": the files sit in the host filesystem, outside the
  Postgres volume and the app container — browsable, copyable off-box, restorable
  onto fresh hardware. (Storing backups _in_ the DB would die with it; inside the
  container they'd vanish on rebuild.)
- **Rolling retention.** Each run writes `hame-auto-<ISO timestamp>.json` and then
  prunes the oldest beyond a configurable `retentionCount` (default 7). ISO
  timestamps sort lexicographically, so "newest N" is a sort-and-slice.
- **A stored seal passphrase.** A scheduled run has no human to type a passphrase,
  so one is set once by the admin and **AES-256-GCM encrypted at rest** (the
  Immich/WiFi pattern), decrypted at backup time to seal each file. Crucially the
  files still decrypt with the **passphrase alone** (not the instance
  `ENCRYPTION_KEY`), preserving the restore-onto-a-fresh-box property — which is
  exactly what makes them useful when the original instance is gone. The admin is
  warned to record the passphrase off-box, since a destroyed DB takes the stored
  (encrypted) copy with it.
- **Schedule in the DB, a coarse tick, catch-up.** `BackupSettings` (§7.8) holds
  the toggle, `frequency` (daily/weekly) + `hour`/`weekday`, and `retentionCount`.
  A fixed **hourly** `node-cron` tick reads the row and a **pure `isBackupDue`**
  (in `@hame/shared`, UTC/DST-free, the recurrence/reminder-engine split) decides —
  so the schedule is runtime-adjustable without rescheduling cron, and a slot
  **missed while the container was down is caught up** on the next tick (and shortly
  after boot). A failed run records `lastError` and keeps going (graceful-degrade,
  §9.6); the manual **Back up now** button runs one immediately.
- **Access & safety.** Admin-only, CSRF-protected endpoints
  (`GET`/`PATCH /api/backup/settings`, `POST /api/backup/run`); the settings read
  returns only `hasPassphrase`, never the passphrase. Files are written `0o600` in
  a `0o700` directory and git-ignored. Restore reuses the existing upload flow
  (download a file off the host, restore it under the Data card).

---

### 8.16 QuickNotes (Household Noteboard)

A lightweight household "fridge board": short, glanceable notes surfaced where the household already looks — the dashboards and the wall-tablet screensaver — rather than a chat app (which the phones in everyone's pocket already do better). It's the ambient wall surface Hame uniquely has, worn as a note. Two audiences:

- **Household note** — the shared board: shows on **every** dashboard's QuickNotes widget and rotates through the **idle screensaver** (§8.14).
- **Direct note** (member → member) — a private sticky shown **only** on the recipient's own signed-in dashboard; never on the shared tablet or the screensaver.

**Composing**

- From the QuickNotes widget's **+** — a small dialog: body text (≤280 chars, emoji fine), audience (Household / a specific member), optional pin, optional colour tint (defaults to the author's `User.colour`).
- The shared **wall-tablet account** (§8.1) can post **household** notes only ("Back in 10"), authored as _Wall tablet_; it can't send a direct note (it isn't a household person).

**Lifecycle (anti-clutter)**

- Every note carries an optional **`expiresAt`**, defaulting to `now + 7 days`. **Pinned** notes never expire and sort to the top.
- Expired notes are filtered on read; a nightly `node-cron` sweep (the §9.6 mould) hard-deletes them.
- **"Got it" dismiss** — anyone can clear a household note from **their own** board (a `NoteAck` row); it stays for everyone else. The author can **delete** a note outright (gone for all).

**Surfaces (all existing seams)**

- **Widget** — a new `quickNotes` dashboard widget (§8.12 registry). It shows household notes on any dashboard; on the viewer's **own** dashboard it also shows direct notes addressed to them. Ordered pinned-first then newest; each note tinted, with author avatar and relative time.
- **Screensaver** — a `notes` screen joins the idle rotation ring (§8.14), shown only when an undismissed household note exists right now (same skip-when-empty rule as the bins/meals screens). Household notes only.
- **Notification** — a new **direct** note pings its recipient through the existing engine (§8.13, HA push), gated on `NotificationPreference.directNoteAlerts` (default on). Household notes stay ambient (no push).

**Privacy invariant.** The notes feed is scoped **server-side to the authenticated user** — household notes plus their own direct notes. The wall tablet paging a member's dashboard requests as the `TABLET` account (§8.1), so it structurally can never receive that member's direct notes: privacy is enforced by the query, not the UI.

**API** — a `notes` slice: `GET /api/notes` (viewer-scoped feed), `POST /api/notes`, `PATCH /api/notes/:id`, `DELETE /api/notes/:id`, `POST /api/notes/:id/dismiss` (upserts a `NoteAck`). CSRF-protected; `@hame/shared` Zod schemas are the single source of truth for both the compose form and request validation.

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

### 9.6 Pluggable, Self-Correcting Bin Sources

A `BinCollection` separates **how it looks** (colour, icon, reminders, the widget) from **where its dates come from** (`sourceType`, §8.9). `MANUAL` bins compute dates from the recurrence engine; external sources (iCal / scraper / Home Assistant) fetch them through one `BinScheduleProvider` interface and cache concrete dates as `BinOccurrence` rows, refreshed on a cron (`BIN_SYNC_CRON`).

Because each sync **replaces** a bin's cached occurrences wholesale, the schedule is **self-correcting** — a bank-holiday shift just appears on the next run, with no calendar maths and the council/feed as the source of truth. A failed fetch leaves the existing cache intact and reports a warning (the same graceful-degrade contract as iCal calendar sync, §8.10). The provider seam ships first (Phase 5.6); the providers behind it land one at a time.

### 9.7 Type-Safe End-to-End

Prisma generates DB types → Express returns typed data → Zod validates inputs → React consumes typed responses. No `any` types anywhere in the codebase.

### 9.8 Portable, Re-keyable Logical Backup

Backup is **logical, not physical** (§8.15): a schema-aware export of the rows
rather than a `pg_dump` binary image, so it is human-inspectable, restores
through the app with no shell, and survives onto any instance at the same
migration. Three properties make it robust:

- **Decoupled from `ENCRYPTION_KEY`.** The at-rest AES-GCM secrets are decrypted
  on export and re-encrypted under the target's key on import, so a backup is not
  chained to one instance's key. The file is instead protected by an **argon2id
  KDF + AES-256-GCM** wrapper under a user passphrase — the same authenticated
  encryption used for secrets at rest (§11), applied to the whole file.
- **Preserve-UUID, transactional restore.** Every primary key is a UUID, so a
  restore keeps original ids and every foreign key lines back up with no
  remapping; the wipe-and-reload runs in a single transaction, so a failed
  restore leaves the instance intact.
- **FK order as tested data.** The table insert/delete ordering lives as an
  explicit list in `@hame/shared`, with a test asserting it **covers every Prisma
  model** — so adding a model later without adding it to the backup fails a test
  rather than silently dropping a table from every backup (the same "a change
  fails a test" ethos as the bin-scraper fixtures and the QR encoder, §10).

### 9.9 Pluggable Integration Providers

The bin-source seam (§9.6) generalised. An external self-hosted service reaches
Hame through a first-party **`IntegrationProvider`** module registered in a
registry — the same "drop in a module" contribution model as a bin-scraper
council. Each provider declares its `config` / `secret` fields (which drive a
generic settings form + test-connection, so a new provider ships **zero bespoke
UI**) and its output **kind**, and **owns its transport** — the core only ever
sees normalised data, which is what lets one abstraction span a plain HTTP `GET`
and a stateful WebSocket handshake. `STATUS` providers return a metric snapshot
for a generic dashboard tile; `CALENDAR` providers return `IntegrationEvent`s the
aggregated calendar (§9.5) unions in. Instances are `Integration` rows with an
encrypted secret (§11), refreshed by a poller on the `BIN_SYNC_CRON`
graceful-degrade contract (a failed poll keeps the last good data, §9.6).
**Read-only by design**: the `feed` (list) kind is deferred and `action` / control
is a non-goal (§12), keeping the abstraction inside the Phase 8.6 security
envelope. Built Phase 10.

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

### Phase 1.1 — First-run setup token ✅ Complete (11-07-2026)

Close the first-run land-grab (§8.1): on a publicly-reachable instance the open setup wizard could be claimed by whoever loads `/setup` first. **No migration** — the guard is an in-memory secret, not a schema change.

**Goal**: Only whoever controls the server (its logs) can create the first admin.

**Delivered**: A dependency-free `lib/setup-token.ts` (`node:crypto` `randomBytes` + `timingSafeEqual`) holding a one-time token in memory. On first-run boot — when `prisma.user.count() === 0` — `index.ts` mints it and prints it prominently to the logs; `SetupSchema` in `@hame/shared` gains a required `setupToken`, so the wizard form gets the field for free (single source of truth); `createInitialAdmin` verifies it (constant-time) **after** the existing user-count guard, throwing a `403` on a bad/absent token and clearing the token on success (single-use). A brute-force limiter (10/15 min per client IP, POST-only so the polled `GET /status` is never throttled) sits on `/api/setup`; the setup route was already CSRF-exempt. Frontend: a "Setup token" field at the top of the wizard with a "find it in `docker logs hame-api`" hint (a new optional `hint` on the shared `FormField`). Docs: README **First-run setup** section, a `docker-compose.prod.yml` comment, and §8.1. Verified: typecheck / lint / format green, **420 API** (+8: the token module's generate/rotate/verify/clear and the service's 403/409/success/single-use paths) **+ 43 web** tests, web build clean, and a **live end-to-end smoke** against a throwaway database — boot printed the token, `GET /status` → `requiresSetup:true`, a wrong token → 403, a missing token → 400 (Zod), the correct token → 201 (admin created), a replay → 409, and `/status` → `requiresSetup:false`.

### Phase 2 — Daily-Use Foundation (MVP) ✅ Complete (18-06-2026)

Tag system, Item library, shopping lists (multi-list, quick-add, archive flow), storage locations + pantry, list-to-pantry flow, rollover logic, basic dashboard with shopping + pantry widgets.

**Goal**: You stop using paper for shopping. Hame is part of daily life.

**Delivered**: A single Phase 2 migration adding `Tag`, `Item`, `ShoppingList`, `ShoppingListItem`, `StorageLocation` and `PantryEntry` (with the `ListStatus` enum and `User` back-relations). Shared `@hame/shared` gains the unit-normalisation module (§9.2) — a display→base-unit conversion map (`g`/`ml`/`unit`) that excludes-and-flags incompatible units rather than summing them — plus Zod schemas for tags, items, shopping and pantry. API vertical slices (thin controllers, thick services) for tags, items (incl. `quick-add` filtering and find-or-create by name), storage locations, pantry (incl. expiring-soon and unit-aware low-stock), and shopping lists — the latter covering tick-to-buy, the archive→pantry flow and rollover-to-new-list inside a transaction with full validation. Frontend: TanStack Query hooks for every resource, a Hearth-styled dashboard (active-shopping, expiring-soon and low-stock widgets), a Shopping page (multi-list selector, quick-add with datalist, tag-grouped check rows, archive dialog) and a Pantry page (locations, stock entry, expiry chips). Verified end-to-end: typecheck/lint/format green, 48 tests pass (incl. unit conversion, archive guards and low-stock aggregation), web build clean, and a live API smoke test of the full create-list → add → tick → archive→pantry → rollover → widgets flow.

### Phase 3 — Chores, Pets & Reminders ✅ Complete (19-06-2026)

Pet CRUD, chore CRUD with all recurrence types, assignment/rotation, completion tracking, instance auto-generation, chore dashboard widget.

**Goal**: Pet care reminders out of your head.

**Delivered**: A single Phase 3 migration adding `Pet`, `Chore` and `ChoreInstance` (with the `RecurrenceType` / `AssignmentMode` / `Species` / `Weekday` enums, the `User` back-relations and the `Chore`↔`Tag` link). Shared `@hame/shared` gains a pure recurrence engine — `firstDueDate` / `nextDueDate` covering all four recurrence types, with day-of-month clamping (31 → 28/29 Feb, 30 Apr) and INTERVAL counting from the completion date while WEEKLY / DATE_OF_MONTH advance from the scheduled due date — plus Zod schemas for pets and chores whose cross-field refinement enforces each recurrence type's required field and each assignment mode's assignee(s). API vertical slices (thin controllers, thick services) for pets and chores implement **event-driven instance generation**: the opening occurrence is created with the chore, the next is generated on completion inside a transaction with the rotation advanced round the household, plus an `uncomplete` undo, schedule-change reconciliation on edit, a `GET /api/chore-instances?due=today` feed for the dashboard, per-pet treatment-history assembly, and a non-sensitive `GET /api/users/members` roster so members can assign chores without admin access. Frontend: TanStack Query hooks for every resource, a Chores page (due-now / upcoming split, circle check-rows per design §6, a recurrence-aware create/edit form), a Pets page and per-pet profile with a treatment-history timeline and the Hearth photo placeholder, and Today's-chores + Pet-reminders dashboard widgets wired into the nav and home grid. Verified end-to-end: typecheck / lint / format green, 67 tests pass (incl. the recurrence engine's clamping/rotation cases and the chore-service generation/rotation/guards), web build clean, and a live API smoke test of the full create-pet → create-rotating-chore → today-feed → complete → next-instance-with-rotation-advanced → pet treatment-history flow.

### Phase 4 — Recipes & Meal Planning ✅ Complete (20-06-2026) ⭐

Recipe CRUD (manual + URL import via schema.org), meal plan calendar (week + month), serving scaling, meal-type complexity toggle in settings, generate-shopping-list flow.

**Goal**: One button: "Generate shopping list for this week."

**Delivered**: A single Phase 4 migration adding `Recipe`, `RecipeIngredient`, `RecipeStep`, `MealPlanEntry` and the `HouseholdSettings` singleton (with the `MealType` enum, the `User` back-relations, the `Recipe`↔`Tag` link and the `Item.recipeUses` relation; ingredient `quantity` is nullable for unquantified staples like "salt to taste"). Shared `@hame/shared` gains a pure `parseIngredientLine` helper — splitting free-text ingredient strings into quantity (decimals, `1/2`, vulgar fractions, `1 1/2`, ranges), display unit, name and a trailing prep note, with staple detection — plus recipe / meal-plan / household-settings Zod schemas, and the §9.2 unit table extended with the convertible cooking measures `tsp`/`tbsp`/`cup` (→ ml). API vertical slices (thin controllers, thick services) cover recipes (CRUD with ingredients/steps replaced wholesale in a transaction, each ingredient resolved to a linked `Item` via find-or-create that infers `baseUnit` from the display unit, plus a delete guard when a recipe is still on the plan), a dependency-free **URL importer** (`integrations/recipe-import`: native fetch + a JSON-LD extractor that finds a schema.org `Recipe` inside `@graph`/`@type` arrays and returns an editable draft, persisting nothing), meal-plan entries (recipe-or-custom-label, servings override), the household-settings singleton (admin-only writes), and the **killer feature** — `POST /api/meal-plans/generate-shopping-list`, which scales each planned recipe's ingredients by servings, sums per `Item` in base units, subtracts pantry stock, excludes staples, surfaces unconvertible units as warnings rather than mis-summing (spec §9.2), and creates a shopping list for the shortfall. Frontend: TanStack Query hooks for every resource, a Recipes library (search, grid, create/edit form with dynamic ingredient/step rows, paste-a-URL import that seeds the form), a recipe detail page with cook-along step ticking, a weekly meal-plan grid (week navigation, per-cell add/edit, an admin meal-type toggle, and the generate-shopping-list dialog with its pantry-aware result + warnings), a Today's-meals dashboard widget, and nav/route wiring. Verified end-to-end: typecheck / lint / format green, 87 tests pass (incl. the ingredient parser, the JSON-LD importer and the generate-shopping-list scaling / pantry-subtraction / staple-exclusion / unit-warning cases), web build clean, and a live API smoke test of the full import → create-recipe → plan-meal → generate-list-with-pantry-subtraction flow.

> Note: the meal-plan **monthly** calendar view is deferred to Phase 5, where it is subsumed by the aggregated calendar (which already surfaces meal entries); the weekly grid ships here.

### Phase 4.5 — Ingredient Normalisation Strategies ✅ Complete (20-06-2026)

Pluggable normalisation of free-text ingredients ("large tomato", "pinch of sugar") into clean, linkable `Item` data, so generate-shopping-list (§8.6) warns less and totals more. Three layered strategies behind one interface; the household picks one, and the default needs no setup.

**Goal**: Messy recipe ingredients become clean shopping-list lines — with or without an LLM.

**Delivered**: A single Phase 4.5 migration adding `Item.typicalUnitGrams`, the `HouseholdSettings.ingredientNormaliser` choice (the new `NormaliserStrategy` enum, default `BASIC`) and the `OllamaConfig` singleton. Shared `@hame/shared` gains the `IngredientNormaliser` contract and the two dependency-free layers — `BasicNormaliser` (wraps `parseIngredientLine`, the always-on floor) and `DictionaryNormaliser` (enriches Basic from a bundled ~150-entry table of canonical names / base units / typical unit weights / staple flags, tolerant of plurals, descriptors and synonyms; unknown items pass straight through). The API adds `LlmNormaliser` (`integrations/ollama`: a single batched `/api/chat` call per recipe over the dictionary result, overriding only where the model gives a usable answer and degrading to the fallback **with a warning that names the actual reason — unreachable vs. e.g. a model-not-found 404 — never a failed import**), a `getNormaliser` factory that reads the household setting and assembles the stack, an `OllamaConfig` service/controller/route (admin-only), and wiring of the configured normaliser into URL import and `findOrCreateItemByName` so the reviewed hints persist onto freshly minted items only.

The pipeline is hardened so the deterministic data always wins where it should: the parser's explicit **quantities are authoritative** (the model can override with a real number but never null one out); a line that ends up with a unit but **no count defaults to 1** ("coriander leaves, to serve"); and a minted item's **base unit is derived from its display unit's family** ("4 tbsp" → ml) so display and base always agree, with a **bare count and no unit** ("8 chicken breasts") defaulting to `unit` rather than the dictionary's weight hint — keeping `generate-shopping-list` (§8.6) totalling cleanly. That endpoint is itself untouched — the LLM never does the arithmetic.

The web adds an admin **Settings** page (strategy selector + an Ollama form that **discovers the server's installed models on blur and offers them as a dropdown**, so there's nothing to type and no save-before-test) and a post-import **review step** showing the strategy, any fallback warnings and a before/after of every ingredient line, which the user confirms before it seeds the editable recipe form. To hide Ollama's cold-start, opening the recipe-import dialog fires a prompt-less `/api/generate` **warm-up** (`POST /api/recipes/import/warmup`) that preloads the configured model while the user pastes a URL — gated to the LLM strategy and fire-and-forget, so a non-LLM household or an unreachable server is a silent no-op. Verified end-to-end: typecheck / lint / format green, 107 tests pass (incl. the dictionary overrides/passthrough, the layered fallback, the LLM JSON parse, quantity-preservation, unit-defaulting and graceful degrade, the factory selection and the warm-up dispatch), web build clean, plus live testing of the full URL-import → LLM-normalise → review → generate-shopping-list flow and a live smoke test of the warm-up endpoint (auth/CSRF guards, BASIC no-op, LLM preload, graceful degrade when Ollama is unreachable).

Design (still the shape that shipped — see §12 "Ingredient Normalisation"):

- **Layered, not parallel.** One base layer plus two optional enrichment layers, each overriding the one below and falling back to it when it has no answer: `[1]` the regex parser (today's `parseIngredientLine`, always the floor and guaranteed fallback) → `[2]` a dictionary lookup → `[3]` an LLM. So "what we have today" is layer 1 standing alone.
- **One contract.** An `IngredientNormaliser` interface — `normalise(rawLines: string[]) → NormalisedIngredient[]`, where `NormalisedIngredient = { canonicalName, quantity, unit, baseUnit, isStaple, typicalUnitGrams? }` — so recipe import and `findOrCreateItemByName` don't care which strategy ran. It takes the whole list so the LLM makes **one call per recipe**, not one per ingredient.
- **Three implementations.** `BasicNormaliser` wraps the existing parser (zero setup, ships by default). `DictionaryNormaliser` runs Basic, then looks each item up in a bundled `@hame/shared` table mapping common items to a canonical name / typical unit weight / staple flag; unknown items pass straight through; no external dependency. `LlmNormaliser` runs Basic/Dictionary first as a fallback, then a batched Ollama call canonicalises and overrides — degrading gracefully to the fallback (with a warning, never a failed import) if Ollama is unreachable.
- **Config.** A household-level choice on `HouseholdSettings` — `ingredientNormaliser: BASIC | DICTIONARY | LLM` (default `BASIC`) — plus an `OllamaConfig` singleton (URL + model name) mirroring `HomeAssistantConfig` / `ImmichConfig`. A factory reads the setting and returns the right normaliser.
- **Runs upstream, stays deterministic.** Normalisation happens at ingestion (URL import / manual add), is reviewed by the user before save, and persists onto `Item` (e.g. `baseUnit`, `isStaple`, a new `typicalUnitGrams` for count→weight maths). `generate-shopping-list` (§8.6) is untouched and stays a fast, reproducible, deterministic engine — the LLM never does the arithmetic, only the fuzzy text → structured-data step.

**Why split out of Phase 4**: the deterministic engine ships first and works; this layer is the quality pass that tackles the fuzzy long tail without making the shopping-list maths depend on a model being present or reproducible.

### Phase 5 — Bins, Calendar & Events ✅ Complete (21-06-2026)

Bin schedules (manual), custom events, iCal sync, aggregated calendar endpoint, calendar UI.

**Goal**: One place to see everything happening.

**Delivered**: Two Phase 5 migrations — `phase5_bins_events` (`BinCollection`, `CustomEvent`) and `phase5_calendar_sources` (`CalendarSource`, `SyncedEvent`, the `CalendarSourceType` enum) — split so each slice landed cleanly. Shared `@hame/shared` gains bin recurrence helpers extending the Phase 3 engine — `nextBinCollection` and `binOccurrencesInRange`, which (unlike chores) anchor an INTERVAL to a fixed `startDate` so a fortnightly cycle lands on the right weeks, and carry no completion or ONE_OFF — plus Zod schemas for bins (recurrence refinement requiring a `startDate` anchor for INTERVAL), custom events (end-after-start), the unified `CalendarEvent` feed shape and calendar sources, and the `CALENDAR_EVENT_TYPES` / `CALENDAR_SOURCE_TYPES` discriminators.

API vertical slices (thin controllers, thick services) cover bins (CRUD, the public shape computing `nextCollection` from the schedule), custom events, and the **aggregated calendar** (§8.10) — `GET /api/calendar?start&end` merging meal entries, chore instances, computed bin occurrences, custom events and synced external events into one live-queried, sorted feed with no materialised table (§9.5); all-day rows are normalised to UTC-midnight so they land on the right day for any viewer. External sync adds an `integrations/ical` layer (`node-ical`) that expands recurring events (RRULE) across a bounded horizon, honouring EXDATE and per-occurrence overrides, behind a `CalendarSource` service that fetches and **replaces a source's cached `SyncedEvent` rows wholesale** in a transaction, degrading gracefully — a failed fetch reports a warning and leaves the existing cache intact rather than wiping it. A `node-cron` job refreshes every active iCal source on a schedule (`CALENDAR_SYNC_CRON`, default every 30 min; the API must run single-instance or jobs double-fire, §4), with a manual `POST /api/calendar-sources/:id/sync` for on-demand refresh.

Web: TanStack Query hooks for every resource, a **custom Hearth month-grid calendar** (month navigation, a colour-coded legend, per-day event pills, click-a-day to add a custom event, click-to-edit/delete custom events while other event types stay read-only), a Bins page (CRUD with a recurrence-aware form and a plain-English "next collection · in N days" line), a "Next bin day" dashboard widget (serif countdown + colour-coded bin squares), and an external-calendars manager (add iCal URL, per-source sync/remove, event counts) wired into the calendar. Verified end-to-end: typecheck / lint / format green, 128 tests pass (123 API + 5 web; incl. the bin engine's interval-anchoring and Feb-clamping, the calendar aggregation across all sources, and the iCal parser's recurrence expansion / horizon filtering), web build clean, plus live smoke tests of the calendar endpoint, the bin/event CRUD, and a full iCal add → sync → aggregated-feed flow (incl. graceful degrade on an unreachable feed).

> **Calendar UI — deviation from the spec.** §4 and this roadmap originally named **FullCalendar**; the calendar instead ships as a hand-built month grid on the Hearth design tokens (the same primitives as the meal-plan grid). FullCalendar's bundled styling reads as a "SaaS console" against the bespoke "paper" design and would need heavy theming — a custom grid is on-brand, dependency-free and gives full control. The deferred monthly meal-plan view is subsumed by this calendar (which already surfaces meal entries); week / agenda views remain available as later polish.

### Phase 5.5 — CalDAV Server (Two-Way Calendar) ✅ Complete (21-06-2026)

An **opt-in** CalDAV server so household members can read **and write** Hame's calendar from their phone's native calendar app (via a client such as DAVx5 on Android), with no native Hame app and no third-party cloud. **Off by default**: with it disabled Hame behaves exactly as it does after Phase 5 — an in-app calendar plus read-only external subscriptions — so households that don't want it pay nothing.

**Goal**: Edit the household calendar from your phone, both directions, fully self-hosted.

**Why a server, not a sync.** Hame _becomes_ the calendar rather than mirroring an external one. The phone (DAVx5) is a thin client editing Hame's events directly, so there is a single source of truth and **none of the two-way reconciliation / conflict-resolution** a Hame↔external-server sync would require — write support falls out of the protocol. (A native Android widget was considered and rejected: it would need a native app, violating the PWA-only non-goal in §3, and would put fragile sync logic on the device.)

**Delivered (v1).** Three Phase 5.5 migrations — `CustomEvent` → `CalendarObject` (adding `uid` / `etag` / `icalRaw`), the `CalDavCredential` model, and the `HouseholdSettings.caldavEnabled` toggle. The Phase 5 `CustomEvent` is **absorbed** into `CalendarObject`, which stores the **verbatim VCALENDAR text** as the source of truth plus extracted `title` / `startTime` / `endTime` / `allDay` for Hame's own grid and the aggregated feed (§8.10) — so a phone's rich event (RRULE, alarms, timezones) round-trips losslessly without Hame modelling every iCal feature. A new `lib/icalendar` builds a minimal VEVENT for web-authored events and parses incoming PUTs (via `node-ical`); the event web form is unchanged and now generates `.ics` underneath. This mirrors the §10 Phase 4.5 normaliser-strategy shape — a lightweight default, opt into the richer thing — and switching is cheap and reversible (turning the server on back-fills `.ics` / UIDs for events created while off; turning it off just stops answering the phone, events remain).

The CalDAV server (`/caldav`, with `/.well-known/caldav`) is a deliberately small but DAVx5-compatible surface: `OPTIONS` (`DAV: 1, 3, calendar-access`), principal + `calendar-home-set` discovery, the one read-write **Household** collection with `getctag`, the `calendar-query` / `calendar-multiget` REPORTs, and `GET` / `PUT` / `DELETE` of `.ics` resources with ETag `If-Match` concurrency — XML built from templates and parsed with targeted regex (no XML-parser dependency). `sync-collection` (RFC 6578) is deliberately omitted; DAVx5 falls back to getctag + getetag diffing. Auth is **per-user app passwords** (argon2-hashed, HTTP Basic), minted/revoked under the profile; the account password is never exposed to the device. The whole tree is gated on the household toggle (admin Settings, default **off**) — off, it 404s, and Hame behaves exactly as after Phase 5.

Web: an admin **CalDAV toggle** in Settings, and a per-user **profile panel** to mint/revoke app passwords and copy the server URL. That URL auto-adapts to wherever Hame is browsed — a configured `CALDAV_PUBLIC_URL`, else the server's detected LAN address (so a phone gets a reachable IP, not `localhost`), else the page origin (correct behind the real domain) — so a cloner sees their own address with no edits. Dev and prod routing front `/caldav` alongside `/api` (Vite proxy; `docker/nginx.conf`).

Verified end-to-end against **real DAVx5** over the LAN — discovery → the Household calendar, a Hame event syncing to the phone, and a phone-authored event flowing back — plus typecheck / lint / format green and 145 tests (140 API + 5 web; incl. the iCalendar round-trip, the CalDAV XML helpers and the derived-calendar generators). Live testing surfaced and fixed three integration bugs: `/.well-known/caldav` answering only GET (DAVx5 sends PROPFIND), discovery hrefs echoing a mount-relative path, and the global `cors()` swallowing CalDAV `OPTIONS` (now scoped to `/api`). A separate window-boundary fix stopped the aggregated calendar clipping timed events on a window's final day.

**Coexists with read-only subscriptions.** The Phase 5 iCal **subscription** sync (`CalendarSource` / `SyncedEvent`) is unrelated and stays available either way — it _consumes_ outside calendars (sports fixtures, a published work calendar); CalDAV _serves_ Hame's own.

**v2 — read-only derived calendars (delivered).** A collection registry generalises the server to several calendars: alongside read-write **Household**, Hame exposes read-only **Meals**, **Chores** and **Bins** as separate CalDAV collections, derived on the fly from the existing rows as all-day VEVENTs with content-hashed UIDs / ETags (nothing persisted) — so a phone shows _everything Hame knows_, each calendar in its own colour, and writes to them are refused (`403`, advertised via a read-only `current-user-privilege-set`). Verified live: discovery lists all four collections, the derived ones populate (meals / chores / computed bin occurrences), and read-only enforcement holds.

**Remaining refinements (not blocking).** Fully expanding RRULE inside Hame's _own_ grid (the round-trip is already lossless; Hame currently shows a recurring event's master), and an early check that **Cloudflare** passes the WebDAV methods (`PROPFIND` / `REPORT` / `PUT`) once deployed behind the real proxy.

### Phase 5.6 — Pluggable Bin Sources ✅ Abstraction + iCal & scraper providers (23-06-2026)

Generalise a bin's schedule from "typed recurrence only" to a **pluggable source** (§8.9, §9.6), so the same coloured widget can be fed by a typed schedule, a council iCal feed, the `uk-bin-scraper` library, or Home Assistant — picked per bin. The original framing (§9.6, §12): point Hame at the council's "this week's collection" data and have it keep the right bins on the right weeks automatically, including bank-holiday shifts.

**Goal**: A bin's dates can come from the council, not just from what you typed — and stay correct without you touching them.

**Delivered (the abstraction).** A single Phase 5.6 migration adds the `BinSourceType` enum (`MANUAL | ICAL | SCRAPER | HOME_ASSISTANT`, default `MANUAL`), `BinCollection.sourceType` / `sourceConfig` / `lastSyncedAt`, the `BinOccurrence` cache table (unique `[binId, date]`, cascade-deleted), and makes `recurrenceType` nullable (external bins carry no recurrence). Shared `@hame/shared` gains `BIN_SOURCE_TYPES`, the `BinSourceConfig` / `BinSyncResult` schemas, and a source-aware bin Zod refinement — a `MANUAL` bin still needs a recurrence type and that type's field (INTERVAL also a `startDate` anchor); an external bin needs its provider's connection detail instead. The API adds `integrations/bin-sources` — one `BinScheduleProvider` interface (`fetchOccurrences(config, horizon) → dates`) plus a registry the bin service dispatches through; a source-aware `bin.service` whose `nextCollection` is computed from the engine for `MANUAL` and from the soonest cached occurrence for external; a `syncBin` that replaces a bin's cached occurrences wholesale in a transaction and degrades gracefully (unreachable feed → warning, cache kept; unwired provider → clear "not available yet"); a `POST /api/bins/:id/sync` endpoint; and a `BIN_SYNC_CRON` `node-cron` job (default nightly) that self-corrects every active external bin. The aggregated calendar (§8.10) and the CalDAV derived **Bins** calendar (§10 Phase 5.5) both read the engine for `MANUAL` bins and the cache for external ones, so external bins surface everywhere a manual one does.

**Delivered (the providers).** Two of the three external sources now run behind the seam, registered at app start.

- **iCal bin source** reuses the Phase 5 `integrations/ical` fetch/parse: it maps a council feed's events to one coloured bin via `sourceConfig.matchKey`, normalises each to a UTC-midnight date and de-dupes — the feed already carries concrete dates, so a sync just caches them and self-corrects.
- **`uk-bin-scraper`** (a new dependency-free workspace package destined for its own repo — §12) handles councils that publish only "this week's collection" plus each bin's weekday and frequency. Per-council adapters expose `findAddresses` + `fetchObservation` behind one interface; a **pure projector** turns one reading into concrete dates — a bin out this week (and any weekly or fortnightly bin) anchors exactly, while a 4-weekly bin not out this week is placed from the last cached date fed back as a `priorAnchor` (`syncBin` passes it), so it pins within one cycle and then self-corrects. Parsers are **fixture-tested against saved real council HTML**, so a markup change fails a test rather than silently mis-dating a collection. The LLM is deliberately not in this path: bin dates run unattended, so the runtime stays deterministic.

The bin form gained a **source picker** (typed schedule / iCal feed / my council's website). The scraper flow adds live lookups (`GET /api/bins/councils`, `/address-search`, `/source-bins`) — council and address pickers plus a bin list read straight from the council page — and a one-click **"add all my bins"** batch (`POST /api/bins/scraper-batch`) that reads the page **once** and creates every chosen bin, **auto-colouring each from its name** (editable, de-selectable). Each external bin's card carries a **Sync now** button and a last-synced line; the nightly `BIN_SYNC_CRON` re-reads every active external bin (which is also what pins a 4-weekly scraped bin over its cycle). Verified end-to-end against a live council site (address search → schedule read → projection → widget/calendar), with 187 tests across the package, API and web.

**Home Assistant** (the fourth source) landed once the Phase 6 WebSocket client existed: a `HOME_ASSISTANT` provider reads the community "UK Bin Collection Data" integration's next-collection sensors (§10 Phase 6.4), offloading scraper maintenance to an active project. All four sources now sit behind the one interface.

**Why this shape.** The seam is small and useful on its own (external bins become a config change, not a refactor); the providers carry real, independent work and landed one at a time against live sources. The scraper lives in-monorepo for a tight iteration loop and will be extracted to its standalone repo (§12) once a few councils are proven.

### Phase 6 — Home Assistant Integration

HA config UI, WebSocket client, entity state reads, device controls, HA calendar source, real-time dashboard updates.

**Goal**: Smart home from Hame, live sensor data on dashboard.

Split into sub-phases (mirroring 4.5 / 5.5 / 5.6), each landing green: **6.1** connection
foundation, **6.2** entity reads + live push, **6.3** device controls + HA calendar source, **6.4**
the Home Assistant bin source (the last unwired bin provider, §10 Phase 5.6).

#### Phase 6.1 — Connection foundation ✅ Complete (24-06-2026)

**Delivered**: The first encryption at rest in the codebase — `lib/crypto.ts` (AES-256-GCM, the
first consumer of the already-wired `ENCRYPTION_KEY`, §11), serialising `iv:authTag:ciphertext` with
GCM tamper-detection. A Phase 6 migration adds the **`HomeAssistantConfig`** singleton (§7.8) storing
the long-lived token as ciphertext; the config service encrypts on write, leaves the stored blob
intact when the token is omitted, and **never returns it** — the read shape carries only `hasToken`.
Shared `@hame/shared` gains the HA config / update / test Zod schemas. An admin-only
`/api/home-assistant` slice (`GET` / `PATCH` / `POST /test`) mirrors the Ollama config pattern.

The integration adds the API's single outbound **WebSocket to HA** (`ws`): a module-level singleton
that runs HA's auth handshake, reconnects with capped backoff, exposes live status, and never throws
into the event loop (stopping retries on a rejected token rather than looping). Its protocol logic is
split into **pure, unit-tested helpers** (`nextAuthStep` / `parseMessage` / `toWebSocketUrl`) so the
auth state machine is tested without a socket — the same split as the Ollama integration. A one-shot
REST probe (`GET /api/`, version from `/api/config`) backs the Settings "Test connection" button
without standing up the socket. The connection starts at boot if active and stops on shutdown,
alongside the existing cron jobs. Web: an admin **Home Assistant** card in Settings — URL, a
write-only token field ("leave blank to keep"), Test connection (surfacing the HA version), Save &
connect / Disconnect, and a live status pill. Verified end-to-end: typecheck / lint / format green,
12 new tests (crypto round-trip + tamper, the config service's encrypt-at-rest / token-never-returned
/ omit-preserves contract, the pure auth-step handler, and the REST probe), plus a **live smoke test
against real Home Assistant** — Test returns the version, Save connects, and the stored token is
ciphertext.

#### Phase 6.2 — Entity reads + live push ✅ Complete (24-06-2026)

**Delivered**: Once authenticated, the HA client seeds an **in-memory entity registry** via
`get_states` and keeps it live by subscribing to `state_changed` events, scoped to a dashboard-domain
whitelist (`HA_DASHBOARD_DOMAINS` — weather, sensors, lights, switches, climate, etc.) — never
persisted (§8.11: no state mirroring; Hame queries HA live, the registry is a cache cleared on
disconnect). Pure, unit-tested helpers (`projectHaState` / `parseStateChangedEvent` /
`isAllowedDomain`) keep the socket out of the parsing, matching the auth-helper split. Shared
`@hame/shared` gains the `HaEntityState` schema and the domain whitelist. Two member-level endpoints
(not admin — dashboard data): `GET /api/home-assistant/entities` returns the current registry, and a
**Server-Sent Events** stream `GET /api/home-assistant/stream` pushes state deltas to the browser
(heartbeat-kept-alive, `EventSource`-read). Web: `useHaEntities` + a `useHaEntityStream` SSE hook that
patches the query cache, and a **Weather** dashboard widget (condition icon + temperature + humidity)
that renders only when HA exposes a `weather.*` entity — so non-HA households never see it or open the
stream. Verified end-to-end: typecheck / lint / format green, 7 new tests (the entity projection /
event parsing / domain filtering), plus a **live test against real Home Assistant** — the widget shows
live weather and updates over SSE without a refresh.

**SSE is a deliberate choice** for the one-directional API→browser hop (commands ride REST); the
bidirectional-WebSocket talking point (§13) is the API↔HA hop, which is a WebSocket regardless. A
documented deviation from §4's stack-table wording, like the FullCalendar deviation (Phase 5).

> While here, a latent bug surfaced and was fixed: the `express-rate-limit` brute-force guard was
> mounted on the whole `/api/auth` tree, so it also throttled the per-page-load `GET /api/auth/me` —
> after 5 refreshes in 15 min a `429` on `/me` logged the user out. It is now scoped to
> `/api/auth/login` only (§11).

#### Phase 6.3 — Device controls + HA calendar source ✅ Complete (24-06-2026)

**Delivered**: Device controls and Home Assistant calendars, both behind the existing Phase 6.1/6.2
client — **no migration** (the `HOME_ASSISTANT` value already existed in both the `CalendarSourceType`
and `BinSourceType` enums). Shared `@hame/shared` gains a tight **`call_service` allowlist**
(`HA_CONTROL_SERVICES` — toggle lights/switches/fans, activate scenes/scripts, trigger automations)
and an `isHaServiceAllowed` guard the request schema enforces, so a crafted request can't drive
arbitrary HA services; plus the `HaServiceCall` / `HaCalendar` schemas and the widget's
toggle/activate domain sets. `scene` / `script` joined the dashboard-domain whitelist so the widget
can list them; `automation` is deliberately kept out of the registry (triggering one stays an allowed
API capability, but a household's automations would flood the calm dashboard).

The HA WebSocket client gains `callService` — it relays `call_service` over the live socket and
resolves on HA's `result` ack, with a **pending-command map** (id-keyed promises, per-command timeout,
all rejected on disconnect) so a control never hangs. Commands ride REST (the §6.2 SSE note): an
admin-or-member `POST /api/home-assistant/service` validates against the allowlist and degrades
gracefully (`{ ok: false }`, never a thrown request) when HA is down. A new `integrations/home-assistant/calendars`
reads HA's REST calendar surface — `GET /api/calendars` (the source picker) and
`GET /api/calendars/<entity>?start&end` — with a pure `mapHaCalendarEvents` (timed vs all-day,
uid+start de-dupe) unit-tested without the network. `syncCalendarSource` now dispatches by type: a
`HOME_ASSISTANT` source stores its calendar **entity id** in `url` and is fetched over the same
horizon as iCal, cached as `SyncedEvent` rows, and surfaced everywhere the aggregated calendar reaches
(§8.10) — the cron now syncs every active source, not just iCal.

Web: a `useHaControl` mutation + `useHaCalendars` query, a **Smart-home quick-controls widget**
(design §6 pill toggles for lights/switches/fans, "run" buttons for scenes/scripts) that renders only
when HA exposes something controllable and reflects state over SSE — the dashboard now owns the single
SSE stream (the weather + smart-home widgets share one connection rather than opening two), and the
external-calendars manager gains a source-type toggle that swaps the iCal-URL field for a Home
Assistant calendar dropdown. Verified end-to-end: typecheck / lint / format green, 207 tests (202 API
+ 5 web; incl. the allowlist + schema refusal, the disconnected-rejection, and the HA-calendar
mapper), all builds clean, plus a **live smoke against real Home Assistant** — the control endpoint's
auth guard (401) and allowlist refusal (400), a `light.toggle` relayed and acknowledged, the calendars
list, and a HOME_ASSISTANT calendar source created → synced → surfaced in the aggregated feed → removed.

#### Phase 6.4 — Home Assistant bin source ✅ Complete (25-06-2026)

**Delivered**: The last unwired bin-source provider (§10 Phase 5.6, §9.6), closing Phase 6 — **no
migration** (`HOME_ASSISTANT` already existed in the `BinSourceType` enum and `BinSourceConfig.entityId`
was already reserved for it). A `HOME_ASSISTANT` provider registered behind the existing
`BinScheduleProvider` seam reads the community "UK Bin Collection Data" integration's bin sensors
straight from the Phase 6.2 in-memory entity registry (no extra HTTP — `sensor` is already a
dashboard domain), mapping a sensor's next-collection date to a cached `BinOccurrence`. Pure,
socket-free helpers — `parseBinSensorDate` (ISO and UK day-first formats; rejects fuzzy labels and
bare day-counts so a non-date never mis-dates a collection), `readBinSensorDate` (the next-collection
attributes, matched case/spacing-insensitively, then the state) and `haEntityToBinOccurrences` — are
unit-tested without a connection, the same split as the auth/entity helpers. Like HA itself the sensor
knows only the _next_ date, so a sync caches that one occurrence and the nightly `BIN_SYNC_CRON` rolls
it forward — the scraper's observe-then-cache shape, minus the projection (HA has done it). The
provider throws (rather than wiping) when HA is disconnected, the entity is missing, or no date is
readable, so the bin service degrades gracefully and keeps the existing cache (§9.6).

Shared `@hame/shared` gains the `HaBinSensor` schema; a member-level `GET /api/home-assistant/bin-sensors`
lists the household's bin sensors — grouped so the integration's several entities per bin (date,
days-until, label, type) collapse to one entry per bin (the canonical next-collection-date sensor's id),
with the next date shown when HA has one and a bin HA hasn't resolved yet (`unavailable`) still listed
with the date pending rather than silently dropped. It feeds a new **Home Assistant sensor** option in
the bin form's source picker that surfaces only when HA exposes such sensors, so a non-HA household
never sees a dead end. Verified: typecheck / lint /
format green, 226 API + 5 web tests (incl. the date-format parsing, attribute-priority, horizon-guard
and disconnected-rejection cases), all builds clean, plus a **live smoke against real Home Assistant**
(with the UK Bin Collection Data integration installed) — the bin sensors read, mapped to a cached
`BinOccurrence` and surfaced in the widget and aggregated feed. Battle-tested.

### Phase 7 — Dashboard Polish

All remaining widgets, drag-and-drop customisation, per-user layouts, **idle mode with Immich photo screensaver + clock cycling**, responsive layouts, PWA.

**Goal**: Hame on the wall tablet looks beautiful, and turns into a digital photo frame when idle.

Split into sub-phases (mirroring 4.5 / 5.5 / 5.6 / 6.x), each landing green: **7.1** the
per-user + household dashboard layout foundation (drag-and-drop, edit mode), **7.1b**
per-owner smart-home selection (reusing 7.1's owner model), **7.2** the remaining widgets
(clock & greeting, upcoming events, WiFi QR), **7.3** idle mode with the Immich screensaver
+ clock cycling (§8.14), **7.4** responsive polish + PWA.

#### Phase 7.1 — Dashboard layout foundation ✅ Complete (26-06-2026)

**Delivered**: The dashboard moves from a static, identical-for-everyone grid to **per-owner,
drag-and-drop layouts** (§8.12). A "dashboard owner" is either a **User** (their personal
dashboard) or the shared **household/tablet** (the wall tablet, §8.14) — the keystone concept this
phase introduces and that 7.1b reuses for smart-home selection. A Phase 7.1 migration adds the
`DashboardLayout` model (one row per user via a unique `userId`, plus a single fixed-id `"household"`
row with `isHousehold` true / `userId` null) and the `User.dashboardLayout` back-relation; `layout`
(react-grid-layout positions per breakpoint) and `widgets` (the ordered enabled set) are JSON,
validated by Zod rather than modelled in Prisma.

Shared `@hame/shared` gains the dashboard contract: a `WIDGET_TYPES` catalogue with per-widget
metadata (`DASHBOARD_WIDGETS` — label, default/min grid size, an HA-gated flag), the responsive
breakpoints/columns (`GRID_BREAKPOINTS` / `GRID_COLS` — a 3-column tablet/desktop grid reflowing to
one column on the phone, design §9), the `DashboardLayoutSchema` (refined so every widget id is
unique and every layout tile maps to a widget) and a pure `buildDefaultDashboard` skyline-packer
yielding `DEFAULT_DASHBOARD` — the zero-setup template an un-customised user or a fresh clone falls
back to. The API adds a thin-controller/thick-service `dashboard` slice — member-level
`GET`/`PUT /api/dashboard?owner=me|household`, owner-validated, re-parsing stored rows so a
hand-edited row can't break the grid — and seeds the household layout.

Web: `react-grid-layout` (pinned to **v1**, the stable `WidthProvider`/`isDraggable` API — its v2
rewrite swaps to config objects and was avoided), a **widget registry** wrapping the existing widgets
unchanged, and a reworked dashboard. An **Edit layout** toggle turns on drag/resize, an add-widget
tray (only **available** widgets — the two HA-gated ones appear only when HA exposes the right
entities) and per-tile remove, with Save/Cancel; a placed-but-unavailable widget shows a quiet
placeholder rather than a hole. A **My dashboard ⇄ Household** toggle (persisted in `localStorage`, so
the wall tablet stays on Household across reloads — no auth changes) selects which owner's layout is
shown and edited. Verified: typecheck / lint / format green, 243 API + 5 web tests (incl. the
default-template integrity, the schema's uniqueness/orphan-tile refinements, and the service's
default-fallback / household-vs-user isolation / owner guard), all builds clean, plus a live API smoke
— login → GET both owners → PUT persists and is isolated from household → owner/body validation (400)
→ CSRF (403) → unauth (401).

#### Phase 7.1b — Per-owner smart-home selection ✅ Complete (26-06-2026)

**Delivered**: The smart-home control list (which Home Assistant devices the widget shows) moves
from a household **singleton** to **per-owner**, completing the carryover from 7.1 and resolving the
Phase 6.3 curation follow-up. A 7.1b migration converts `SmartHomeSettings` to mirror
`DashboardLayout` — one row per user (unique `userId`) plus the single fixed-id `"household"` row
(`isHousehold` true / `userId` null), with a `User.smartHomeSettings` back-relation — carrying the
existing household-wide selection forward as the household row's. The owner model 7.1 introduced is
now **shared**: a small `lib/dashboard-owner.ts` (`DashboardOwner`, `HOUSEHOLD_ID`, `whereForOwner`,
and the `?owner=me|household` `resolveOwner`) backs both the dashboard and smart-home slices, so they
resolve and key the owner identically. The smart-home service, controllers and the five web hooks all
gain the owner; each owner seeds its own new-device "known" baseline independently. A device deleted
in HA is pruned from **every** owner's lists in one cross-owner `array_remove` statement.

Web: a `DashboardOwnerProvider` context lifts the My⇄Household toggle out of the grid so the grid, the
smart-home widget, and the new-device prompt share one owner selection on the dashboard; the
`/smart-home` page gets its own toggle backed by the **same** localStorage key, so "which dashboard am
I configuring" stays one concept across the app. Verified: typecheck / lint / format green, 250 API
(incl. the shared owner resolver's 400/401 paths, the service's per-owner keying and cross-owner
forget) + 5 web + 15 bin-scraper tests, all builds clean, plus a live API smoke against the migrated
DB — login → household selection carried over → a fresh user's `me` list is empty → PUT `me` persists
and stays isolated from household → bad owner (400) → CSRF (403) → unauth (401).

#### Phase 7.2 — Remaining widgets ✅ Complete (27-06-2026)

**Delivered**: The three remaining §8.12 dashboard widgets, slotting into the Phase 7.1 widget
framework (a catalogue entry in `@hame/shared`, a registry component, default-order placement) —
**clock & greeting**, **upcoming events** and the **WiFi QR code**. The first two are pure frontend:
clock & greeting is a self-contained live clock (minute-aligned tick) with a time-of-day greeting and
the signed-in user's first name; upcoming events reads the existing aggregated calendar endpoint
(§8.10) over a 14-day horizon and lists the next few, colour-dotted, with a relative-day/time label.

The WiFi QR widget carries the phase's only new backend: a `WifiConfig` singleton (Phase 7.2
migration) mirroring the Home Assistant / Immich config pattern, with the password **AES-256-GCM
encrypted at rest** (`lib/crypto`, §11); admin-only `PATCH`, validated by a Zod refinement (a secured
network needs a password; an open `NONE` network clears it). Shared `@hame/shared` gains the WiFi
config schemas, the security-type enum and a pure `buildWifiQrPayload` that emits the de-facto
`WIFI:T:…;S:…;P:…;;` join string (reserved-char escaping, `nopass` / hidden handling). The widget is
**local-network-only** (reusing the Phase 1 `isLocalRequest`, §11): the decrypted password is returned
by `GET /api/wifi` *only* to an on-LAN client and the widget renders only then, so the code is shown
openly on the wall tablet but the credentials never travel to a remote (e.g. Cloudflare) client.
Encryption protects the database and backups; the network gate keeps the code off remote screens.

Rather than add a dependency, the QR itself is produced by a small **in-tree, dependency-free encoder**
(`lib/qr`, ISO/IEC 18004 byte mode, error-correction level M, versions 1–10 — far more than any WiFi
payload needs), rendered as crisp SVG (pure black on white for reliable scanning), in keeping with the
project's dependency-light leaning (the bin scraper, the custom calendar grid). It was verified the
hard way: its data / error-correction codewords checked against the standard's Reed–Solomon
arithmetic, then **every output round-tripped through a real QR decoder** across versions 1–10 and
UTF-8 payloads — which surfaced and fixed a transposed format-information placement (the data was
correct, but the 15 format bits were written on the wrong axis, so nothing decoded until corrected).
The widget is offered, placed and shown only when an admin has configured and enabled a network *and*
the viewer is on the local network — and unlike the HA-gated widgets (which show a "needs Home
Assistant" placeholder) it vanishes entirely, giving nothing away off-network. Verified: typecheck /
lint / format green, 263 tests
(250 API + 13 web, incl. the QR encoder's field arithmetic and structural checks), all builds clean,
plus a live API smoke — unauth 401, member read 200, member write 403 (admin-only), CSRF 403, the
secured-without-password 400 refinement, the open-network path, and the stored password confirmed as
ciphertext.

#### Phase 7.3 — Idle mode / Immich screensaver ✅ Complete (29-06-2026)

**Delivered**: The wall tablet becomes a photo frame when left idle (§8.14). A Phase 7.3 migration
adds two singletons mirroring the existing config pattern: **`ImmichConfig`** (URL, an API key
**AES-256-GCM encrypted at rest** — `lib/crypto`, §11 — and *never* returned, the read shape carrying
only `hasApiKey`; plus `selectedAlbumIds`, empty = all photos) and **`IdleModeSettings`**
(household-wide, not per-user, because the wall tablet is shared and no one is logged in during idle —
the kill-switch, the activation / photo / clock timings, and the shuffle / weather / photos-on
toggles, all with the §7.8 defaults). Shared `@hame/shared` gains the Immich config / update ("leave
blank to keep") / test / album schemas and the idle-settings schema with min/max refinements.

A dependency-free `integrations/immich` (native `fetch` + the `x-api-key` header, mirroring the HA REST
probe) touches only the rock-solid album endpoints — `GET /api/albums`, `GET /api/albums/{id}`,
`GET /api/assets/{id}/thumbnail?size=preview` and a best-effort `GET /api/server/version` — with the
socket-free helpers (album/asset parsing, dedupe + shuffle pool building) split out and unit-tested,
the same shape as the HA entity helpers. **"All photos" is interpreted as every image across all
albums**, so nothing depends on Immich's shifting search API (a documented choice). An admin-only
`/api/immich` slice (`GET` config / `PATCH` / `POST /test` / `GET /albums`) encrypts the key on write
and never returns it; a member-level `/api/idle` slice serves the household settings (`GET` member,
`PATCH` admin), the shuffled asset-id pool (`GET /photos`), and — the privacy keystone (§8.14 "Backend
Proxy") — streams each preview through `GET /photo/:id`, so **no Immich credential ever reaches the
browser** and the screensaver works remotely without exposing Immich.

Web: TanStack Query hooks for the three resources, two admin **Settings** cards (Immich connection with
a write-only key field, Test connection and an album multi-select; idle behaviour with the kill-switch,
timings and toggles), and the screensaver itself. It is the **wall tablet's** behaviour, so it runs
only on the home dashboard (mounted there, not app-wide) **and** only on the device showing the shared
**Household** dashboard — never on a phone in normal use; the Household selection is exactly the
wall-tablet signal (§10 Phase 7.1: the tablet stays on Household across reloads). A `useIdleMode` hook
flips into idle after `activationMinutes` of no input
(pointer / key / touch / wheel) and any input instantly wakes it; a **pure, unit-tested state machine**
(`screensaver.ts`) drives the photo ⇄ clock cycle — a run of photos (each `photoDisplaySeconds`,
crossfading via a two-layer stack) then a full-screen clock (`clockDisplaySeconds`, with optional
weather read cheaply from the cached HA entities — no second SSE connection), looping until touch
wakes the dashboard, and falling back to **clock-only** when photos are off or Immich is unconfigured.
The asset pool is fetched lazily (only once idle activates), so a household that never goes idle —
or has no Immich — never hits the integration. Verified: typecheck / lint / format green, **270 API +
21 web tests** (incl. the Immich album/asset/pool helpers, the config service's encrypt-at-rest /
key-never-returned / omit-preserves contract and graceful-degrade, the idle-settings singleton, and the
screensaver state machine), all builds clean, plus a **live smoke against real Immich** — albums and
photos pulled through the backend proxy and cycled in the screensaver, with no Immich credential ever
reaching the browser. Battle-tested.

**Follow-up — idle info screens (04-07-2026).** The photo ⇄ clock cycle grew from two modes to a
skip-empty **rotation** (§8.14): the pure state machine (`screensaver.ts`) now walks a fixed ring
(`photo → clock → bins → meals → …`), skipping any info screen with no content at the transition, with
the clock always in the ring as the guaranteed fallback. Two conditional screens joined it, each 20s and
individually toggleable (`IdleModeSettings.showBinsInIdle` / `showMealsInIdle`, a small
`idle_info_screens` migration): a **bins** screen (a colour-coded wheelie bin per bin due today/tomorrow,
"Out today/tomorrow") and a **meals** screen (today's meal for the current slot — breakfast 06–10, lunch
10–14, dinner 14–20 — as a full-bleed recipe photo + title, with a typographic terracotta fallback).
Pure selectors (`idle-info.ts` — `mealTypeForHour`, `selectDueBins`, `selectSlotMeal`) keep the windowing
unit-tested, the same pure/impure split as the state machine. No new backend data: both reuse the
existing bins and meal-plan endpoints. Two toggles added to the Settings idle card.

#### Phase 7.4 — Responsive polish + PWA ✅ Complete (29-06-2026)

**Delivered**: Closes Phase 7 — Hame is now an installable **PWA** (§4 "Vite PWA Plugin", §8.12) and
the UI is tuned for its two real targets, the **landscape wall tablet** and a **portrait phone**.
Frontend-only, **no migration**.

`vite-plugin-pwa` (Workbox `generateSW`) adds a web-app **manifest** (name/short_name "Hame",
`standalone`, `start_url`/`scope` `/`, Hearth `#f4ede1` theme/background) and a **service worker**
that precaches the built shell so an installed Hame opens offline, with an SPA `navigateFallback`
whose **denylist keeps `/api`, `/caldav` and `/.well-known` always on the network** — app data, auth
and CalDAV are **never** cached, so there's no stale household state and no CSRF/session breakage. The
only runtime cache is a `StaleWhileRevalidate` rule for Google Fonts, so the typefaces still render
offline; the SW is disabled in `pnpm dev` so it can't cache the Vite API/CalDAV proxy while iterating.

A new Hearth-styled **app icon** (a terracotta house with a hearth flame on the warm cream field) is
the source for the generated maskable/any 192·512 PNGs, the 180px apple-touch icon and a refreshed
`favicon.svg`; `index.html` carries the apple-touch link and the iOS standalone metas. Registration
and updates run through `useRegisterSW` (registerType `prompt`, `injectRegister` null to avoid a
double register): a quiet bottom **"new version ready — Reload"** toast and a **"you're offline"**
banner (`pwa-prompts.tsx`, mounted once at the root). The offline state is an in-app banner rather
than a static `offline.html` — the SPA shell is always precached, so a standalone fallback page would
never actually render, whereas a `navigator.onLine` banner reliably shows.

Responsive polish was Tailwind-only (no structural rework — the nav shell and the dashboard / meal-plan
grids already reflowed): tighter global `container` gutters on phones (`1rem`, widening to `2rem` from
`sm`), a compacted **month grid** below `sm` (smaller cells / gaps / event pills so the seven columns
stay legible on a phone), and a scaled-down dashboard greeting. An audit confirmed the rest already
reflowed — no tables, no fixed-width overflow.

Verified: typecheck / lint / format green, the full suite still **291 tests** (270 API + 21 web) — no
new unit tests, the change being config + presentational — and the web build clean, emitting
`manifest.webmanifest`, `sw.js` + the Workbox runtime and the precached shell/icons, with the
generated SW confirmed to carry **no `/api` in its precache** (only in the navigation denylist).
Installing on a phone/tablet for the real add-to-home-screen + offline check is the one remaining
battle-test, like the Immich / HA live smokes.

**Follow-up — portrait-tablet breakpoint (20-07-2026).** The original responsive split reused a single
1024px cutoff for both the dashboard grid and the nav shell — but that's a _desktop_ width, so a
portrait tablet (the primary wall-tablet target, ~800px) fell into the phone bucket: a single-column
stack and the hamburger drawer instead of the widget grid. Fixed by adding a **2-column portrait-tablet
tier**. `GRID_BREAKPOINTS` / `GRID_COLS` (`@hame/shared`, design §9) become three tiers — 3 columns at
≥880px, 2 at ≥512px, 1 below — where the thresholds are grid-**container** widths (what
react-grid-layout measures, i.e. the viewport minus the icon rail and gutters), not the viewport, which
is why they sit below the matching device widths. The paired nav-rail cutoff drops from `lg` to `sm`
(640px viewport), so a portrait tablet keeps the persistent icon rail rather than the phone drawer. No
migration: existing layouts carry only the `lg`/`xs` keys and react-grid-layout synthesises the new
`md` layout on the fly, persisting it on the next save.

**Phase 7 is complete.**

### Phase 7.5 — Shared wall-tablet account & dashboard switcher ✅ Complete (12-07-2026)

A first-class **wall-tablet account** and a **dashboard switcher**, so the shared wall
tablet can page through every household member's dashboard read-only without handing it a
real member's login or any settings access (§8.1, §8.12). Slotted here in build order (a
dashboard concern, extending the Phase 7.1 owner model).

**Goal**: Walk up to the wall tablet, flip to your dashboard — and nobody can reach settings from it.

**Delivered**: One migration (`phase_7_5_tablet_role`) adds a **`TABLET`** value to the `Role`
enum — a shared, non-admin account for the wall tablet. It has member-level permissions (so the
existing `requireAdmin` gate already keeps it out of settings, users, integrations and backups) but
is **not a household person**: `@hame/shared` gains `PERSON_ROLES`, and the members roster, the
notification run and the chore-stats leaderboard all filter to it — so the tablet never appears as an
assignee, a rotation member, a push recipient or a stats row. Because the tablet is nobody, completing
a chore from it opens a **"who completed this?"** picker and credits the chosen member (§8.7); the
completion endpoint enforces this, refusing a completion that would be banked to a non-person. The
generic person update/delete refuse a
`TABLET` target, so its lifecycle is the dedicated endpoints alone and it can't be promoted to admin.
It's **auto-provisioned at first-run setup** alongside the admin (setup now returns `{ admin, tablet }`,
the generated password shown once), seeded for `pnpm db:seed`, and managed from **Settings → Users**
(`GET`/`POST /api/users/tablet`, `POST /api/users/tablet/reset` — the password a readable grouped
token, returned once and only ever stored argon2-hashed, a reset bumping `tokenVersion` to revoke the
tablet's sessions).

The **read-any-dashboard** capability is a single asymmetry in the shared `resolveOwner` (§10 Phase
7.1b): `?owner=` now also accepts a **member id**, but only on **reads** (`allowOtherUser`), while
writes stay restricted to `me` / the caller's own id and `household`. So any client can *view* another
member's dashboard (and their smart-home widget), but only ever *save* its own or the household layout
— the whole "view everyone, edit only your own" gate, enforced server-side for both the dashboard and
smart-home slices. Web: the dashboard's My⇄Household toggle becomes a **roster switcher** (Household +
each member, the signed-in person shown as "My dashboard"); a board other than your own is **read-only**
(no Edit button, a "Viewing … · read-only" chip) and the smart-home **new-device prompt** is suppressed
there; the tablet account — not a person, so absent from the roster — defaults to Household. The setup
wizard and an admin **Wall-tablet account** card surface the login once.

Verified: typecheck / lint / format green, **499 tests** (456 API + 43 web; incl. the resolver's
read-allows-member-id / write-rejects-403 / malformed-400 cases, the tablet provisioning
create/reset/409/404 and the generic-endpoint guard, the roster/stats exclusion, and the
complete-instance completer credit / non-person refusal), all builds clean,
plus a **live end-to-end smoke**: the tablet absent from `/members`, an admin reading another member's
dashboard (200) but refused a cross-user write (403), and the tablet account logging in (role TABLET),
viewing a member's dashboard (200) yet refused `/api/users` and `/api/backup/settings` (403) and any
cross-user dashboard write (403).

**Follow-up — the tablet is optionally named (25-07-2026).** The tablet was provisioned with
placeholder profile fields (`firstName: 'Wall'`, `surname: 'Tablet'`), which the dashboard greeting
then dutifully read out as "Good morning, **Wall**." — it addressed the furniture. Its `firstName`
now doubles as an **optional display name**: blank (the new default) means unnamed and the greeting
drops the name entirely, while an admin can set one under **Settings → Users** and have it read
exactly like a member's. A data-only migration (`tablet_display_name`) clears the placeholder from an
already-provisioned tablet, but only where it is still untouched, so a tablet someone had already
named keeps that name. The one place a blank name could have rendered as nobody is attribution — the
tablet is member-level, so it can post a QuickNote or add to a shopping list — so `toMemberSummary`
(the *display* shape others see) falls back to a "Wall tablet" label, while `toPublicUser` (the
*account* shape) returns the blank verbatim, which is precisely what lets the greeting omit it. The
duplicated greeting logic in the page header and the clock widget collapsed into one pure
`greetingLine` helper, unit-tested; the greeting deliberately follows the **signed-in account**, not
the dashboard being viewed, so paging the tablet through a member's board doesn't start greeting
them. Verified: typecheck / lint / format green, **499 API + 50 web + 15 bin-scraper tests** (+6 API
for the unnamed provisioning, the name set/clear/404 and the attribution fallback; +5 web for the
greeting helper), all builds clean.

### Phase 8 — Notifications

In-app toasts, per-user preferences, push via HA, streak tracking & stats.

**Goal**: Reminders reach you when away from dashboard.

Split into sub-phases (mirroring the earlier phases), each landing green: **8.1** in-app toasts,
**8.2** per-user preferences + scheduled push via Home Assistant, **8.3** chore streak tracking &
"pulling your weight" stats.

#### Phase 8.1 — In-app toasts ✅ Complete (30-06-2026)

**Delivered**: A lightweight, dependency-free toast layer for feedback while a user is active
(spec §8.13). A Zustand `toast` store (`stores/toast.ts`) holds a small queue with per-tone
auto-dismiss (success 3s, info 4s, error 6s; a zero duration disables it) and a context-free
`toast.success` / `.error` / `.info` API callable from anywhere, rendered by a single Hearth-styled
`Toaster` mounted once at the root (`main.tsx`) — stacked bottom, dismissible, screen-reader
announced. The existing TanStack Query mutation hooks (shopping, chores, pets, recipes, custom
events, bins, calendar sources, users) now fire a toast on success/failure, so every state-changing
action gives consistent confirmation without per-page wiring. Frontend-only, no migration. Verified:
typecheck / lint / format green and the store unit-tested (enqueue, distinct ids, tone durations,
immediate dismiss, auto-dismiss-off).

#### Phase 8.2 — Per-user preferences + push via Home Assistant ✅ Complete (30-06-2026)

**Delivered**: Scheduled reminders pushed to each member's phone through Home Assistant — HA owns the
phone push, so there's no duplicated notification infra (spec §8.13) — gated by per-user preferences.
A Phase 8 migration adds the `NotificationPreference` model (§7.8): one row per user, the six category
toggles (bins / chores / expiry / low-stock / pet-care / custom-events), a `pushViaHA` master switch,
the chosen `haNotifyService` (the user's `notify.*` target, null until picked → push no-ops) and an
opt-in `criticalAlerts` (iOS critical / high-priority, bypasses silent/DND). The row is created lazily
all-on on first read, so a household that never opens settings still gets toasts and would get push
the moment they pick a phone.

Shared `@hame/shared` gains the preference read/update schemas and the `HaNotifyTarget` shape. The
reminder logic is split pure/impure like the HA protocol helpers: a **pure `reminder-engine`**
(`integrations/notifications`) takes a pre-digested snapshot of the household's day plus one user's
prefs and returns the push(es) — a morning day-ahead digest (bins out today, the assignee's own chores
& pet-care, expiring-soon, low-stock, today's events) and an evening "bins out tomorrow" heads-up —
assembling text by category and slot and never sending a blank. Delivery is **stateless and
time-anchored** (spec §7 models no feed): a `node-cron` job (`NOTIFICATION_CRON`, hourly by default;
single-instance caveat, §4) fires the `notification.service`, which picks the slot from the hour,
builds one shared day snapshot, and for each user with push + a phone target pushes through
`sendHaNotification` — so a reminder goes out once a day by virtue of the hour, with no "already-sent"
store, and does **not** re-fire at boot (a restart shouldn't re-push the day). Degrades gracefully
throughout (no HA → nothing sent; a failed push is logged and the run continues).

The API adds the member-level `notification-preferences` slice (`GET` / `PATCH`, lazy-upsert) and a
`GET /api/home-assistant/notify-targets` that discovers the household's phones for the picker — the
`notify.*` domain is a grab-bag (Alexa media players, groups, scripts), so it filters to the
Companion-app devices (`notify.mobile_app_*`) and labels each with its friendly name from HA's device
registry (fetched over the live socket, since HA exposes the registry only over WebSocket; a
`mobile_app_<slug>` service is HA's slugify of the device name, so the two map cleanly, preferring a
user's device rename). Best-effort — if the socket's mid-reconnect the slug-derived label stands — and
an unreachable HA is swallowed to an empty list. Web: a **Notifications**
panel on the Profile page — the category toggles, the push master switch, the HA phone dropdown
(from notify-targets) and the critical-alerts opt-in — with toast confirmation on save. Verified:
typecheck / lint / format green, tests for the reminder engine (slot/category assembly, assignee-only
chores, empty-suppression), the preference service (lazy default, partial update, target clear) and
the HA notification builder, plus a **live smoke against real Home Assistant** — a morning digest and
an evening bins heads-up delivered to a phone via the mobile-app notify service.

#### Phase 8.3 — Chore streaks & "pulling your weight" stats ✅ Complete (02-07-2026)

**Delivered**: The household chore stats §8.7 / §9.4 always said the instance pattern would unlock —
**no migration and no new model**, derived live from `ChoreInstance` completion history. Shared
`@hame/shared` gains two pure, DST-safe helpers (`chore-stats.ts`, the same pure/impure split as the
recurrence and reminder engines): `computeStreak` — the run of consecutive days, ending today or
yesterday (a grace day so it doesn't reset the instant midnight passes), on which a user completed at
least one chore — and `isOnTime` — completed on or before the due day, comparing a full local
timestamp against a UTC date-only `dueDate` by calendar day. Both reduce dates to a `Date.UTC`-based
integer day-ordinal so daylight-saving shifts can't misalign a run. Plus the `ChoreStats` /
`UserChoreStats` read schemas and the `STATS_WINDOWS` (7 / 30 / 90 days) `?days=` query schema
(default 30).

The API adds a member-level, read-only `GET /api/stats/chores?days=` behind a thin controller: the
`stats.service` reads every completion over the wider of the selected window and a 90-day streak
look-back in one query, then the counts / household-share / on-time rate use the window subset while
the streak uses the full tail, returning per-user rows sorted most-completed first. Web: a
`useChoreStats` hook, a **Stats** page (new nav entry) with a 7/30/90 window picker and per-member
share bars, completions, on-time % and current streak, and a compact **Chore stats** dashboard widget
(a 30-day leaderboard with streak flames) slotted into the Phase 7.1 widget framework (catalogue
entry, registry component, default order — so fresh clones get it; existing dashboards add it from the
edit tray). Verified: typecheck / lint / format green, 13 new tests (the streak
grace/break/dedupe/order cases, the on-time boundaries, and the service's aggregation incl.
window-exclusion and the empty-household case), all builds clean.

**Phase 8 is complete.** (Deeper gamification — streak badges, longest-streak records, a fuller
"pulling your weight" dashboard — stays a §12 down-the-line nicety, not needed for a two-person
household.)

### Phase 8.4 — Consumables (household re-order checklist) ✅ Complete (03-07-2026)

A shopping enhancement (slotted here in build order — not part of Phase 8's notifications theme;
§8.3 / §8.6): non-perishable, non-recipe household goods — loo roll, kitchen roll, foil, washing-up
liquid, dishwasher tabs, sugar — get a curated **consumables list** to tick from when building a
shop, instead of falling through the recipe/pantry cracks.

**Goal**: The boring-but-essential household items never get forgotten off a shop.

**Delivered**: One migration added `Item.isConsumable` (mirrors `isStaple`) and a nullable
`Item.reorderIntervalDays` (a re-order cadence — it drives the "probably due" highlight below, and
the auto-estimate in §10 Phase 8.5), plus `ShoppingListItem.sources` (the new `ShoppingItemSource`
enum — `MANUAL | MEAL_PLAN | CONSUMABLES | ROLLOVER`) behind the ×N merge badge. Shared
`@hame/shared` gained the consumable / source schemas. The API added a **consumables** slice (list /
flag / unflag via find-or-create, and a "last bought N days ago" read from `boughtAt` history) and
folded the **merge-and-union** rule into both the shopping add path and `generate-shopping-list`,
which now **folds the shortfall into a target list** (most-recent active, or new) rather than always
minting one. Web: a **Consumables** page (curated list, auto-flag add, optional cadence field), an
always-available **"Add consumables"** checklist on the Shopping page, the **×N merge badge** on
summed lines, and the **two-panel generate modal** (food list + consumables checklist).

**"Probably due" highlight**: a consumable whose cadence (`reorderIntervalDays`) has elapsed since
its last purchase is flagged with a **Due** chip and pre-ticked in the add-consumables panel and
the generate modal. A consumable never bought stays neutral (no baseline to nag from).

### Phase 8.5 — Auto-cadence consumables (Labs) ✅ Complete (05-07-2026)

An opt-in refinement to the §8.3 re-order cadence. Today a consumable's
`reorderIntervalDays` is a static number a household member types in — most never get one, so they
never surface as "probably due" (§10 Phase 8.4). This phase **infers a cadence from the purchase
history Hame already records** (`boughtAt`), behind a household **Labs** toggle, so nothing changes
by default.

**Goal**: Consumables you buy on a rhythm surface as "due" on their own — without anyone typing a number.

**Design** (the shape that shipped):

- **One household setting** — `HouseholdSettings.autoConsumableCadence` (default **off**, admin-only,
  in a new Settings **"Labs"** card with a plain-English explainer). Off = exactly today's behaviour:
  manual cadences only, no suggestions, no chips no one typed.
- **Manual cadence is always definitive** — a typed `reorderIntervalDays` drives the "due" highlight
  and is **never overwritten** by anything automatic. Everything below sits on top of that, only when
  the toggle is on:
  - **Suggest (≥3 purchases, no manual cadence)** — offer the estimate as a one-tap **Use** that
    writes it as the manual value; drives nothing until accepted.
  - **Auto-apply (≥4 purchases, no manual cadence)** — the estimate takes effect: the item lights up
    the **Due** chip and pre-ticks in the add-consumables / generate panels exactly as a typed cadence
    would (§8.3) — **`Due` + pre-tick only, never silently dropped onto a live list**. Shown as an
    "auto" cadence with a **Pin** that promotes it to a manual value.
  - **Divergence nudge (manual cadence set)** — when the observed cadence diverges materially from the
    typed one (outside ~0.5×–2×), a small tag suggests the change; accepting overwrites the manual
    value (a user's explicit choice, so overwriting is fine).
- **The estimate** is the **median** of consecutive-day gaps between purchases (deduped to calendar
  days, windowed to the most recent ~6), robust to the odd double-buy or long gap. A **regularity
  guard** keeps an erratic history (wildly varying gaps) at "suggest" rather than auto-applying a
  meaningless number.
- **Stays derived, never materialised** — the estimate is computed on read from existing `boughtAt`
  history and is **never written into `reorderIntervalDays`** unless the user accepts/pins it, so that
  column remains manual-only forever and turning the toggle off reverts instantly (no data migration,
  no stale auto-written values). Mirrors the "derive live, track nothing extra" shape of the §8.3
  "last bought N days ago" hint.

**Delivered**: One migration added `HouseholdSettings.autoConsumableCadence` (default off). Shared
`@hame/shared` gained three pure, unit-tested helpers — `suggestReorderInterval(purchaseDates)`
(dedupe → window of the recent ~6 → **median** of consecutive-day gaps → a `confident` flag gated on
≥4 purchases and a regularity guard, coefficient-of-variation ≤ 0.4; reusing the DST-free day-ordinal
maths §10 Phase 8.3), `effectiveReorderInterval({ manual, suggestion }, enabled)` (the manual-wins
precedence — so Option-1 "suggest-only" is the same function with `enabled` false) and
`consumableCadenceState(...)` (classifying a row as manual / diverged / auto / suggested / none) —
plus the extended `ConsumableSchema` (`suggestedIntervalDays`, `suggestionConfident`,
`effectiveIntervalDays`, `cadenceState`). The consumables service swapped its last-bought
`groupBy(_max)` for a per-item `boughtAt` series (one query covering both `lastBoughtAt` and the
estimate) and reads the household toggle — off = manual only, so it doesn't even compute an estimate;
`isConsumableDue` now consumes the **effective** cadence, so the `Due` chip and both pre-tick panels
light up from auto values with no change at the call sites. Web: an admin **Labs** card in Settings
(explainer + toggle, invalidating the consumables cache on change) and **Auto / Suggests /
History-suggests** tags on the Consumables rows — each with a tooltip, so a non-admin member
understands an auto chip in-context (there is no member-facing Labs menu) — plus the **Use** / **Pin**
actions that adopt an estimate as the manual value. Verified: typecheck / lint / format green, 393
tests (350 API + 43 web; incl. the median/outlier, 3-vs-4-purchase, regularity, windowing and dedupe
cases, the precedence and cadence-state matrix, and the service's toggle-gated computation), all
builds clean, plus a live integration smoke against the real DB — a consumable with four ~21-day-apart
purchases reads `none` with the toggle off and `auto · 21 days` (confident, effective 21) with it on.

### Phase 8.6 — Security hardening (pre-open-source) ✅ Complete (05-07-2026)

A focused hardening pass before the repository goes public — closing the attack
vectors a reviewer (or a self-hoster with a less-trusted household) could reach,
and tightening a few defaults. One migration (`security_token_version`);
otherwise service / middleware / schema changes.

- **SSRF guard on user-supplied fetches.** Recipe import (§8.5) and external iCal
  feeds (§8.10) fetch arbitrary URLs, so a member could otherwise point them at
  internal services. A shared `safeFetch` (`lib/safe-fetch.ts`) rejects any
  non-http(s) scheme and any host that resolves to a loopback / private /
  link-local / reserved address (incl. the `169.254.169.254` metadata endpoint),
  and **re-validates on every redirect hop** so a public URL can't 302 onto an
  internal one. Deliberately **not** applied to the admin-configured Home
  Assistant / Immich / Ollama clients, which are *meant* to reach the LAN.
- **URL-scheme validation (stored-XSS fix).** Zod's `.url()` accepts
  `javascript:` / `data:`; a shared `httpUrl()` now constrains user URL fields
  (recipe source/image, pet image, avatar) to http(s) at the schema, with a
  defence-in-depth guard at the one render site that puts a URL in an `href`.
- **CSP + security headers** on the served HTML (`docker/nginx.conf`) —
  `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, plus
  `X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options`.
- **Session revocation.** A `User.tokenVersion` is embedded in the session JWT
  and checked in `requireAuth`; a password or role change bumps it, invalidating
  outstanding sessions at once (previously a captured token stayed valid for the
  whole idle window).
- **Rate limiting broadened.** A coarse per-client limiter now spans the whole
  API (not just login), and every limiter keys on `CF-Connecting-IP` behind
  Cloudflare so external clients don't share one edge-IP bucket. The CalDAV
  server gained a failed-attempt limiter and a timing-equalised app-password
  check (matching the login path).
- **Immich proxy scoped.** The screensaver photo proxy (§8.14) now serves only
  assets in the configured album pool (cached briefly), so a member can't
  enumerate the whole library by guessing asset ids.
- **Tighter defaults.** `JWT_SECRET` minimum raised to 32 chars; demo seed data
  de-personalised.

Verified: typecheck / lint / format green, 399 tests (356 API + 43 web, incl. the
SSRF guard's scheme / private-range / redirect cases and the token-version
rejection), all builds clean.

### Phase 8.7 — Meal-plan generation ✅ Complete (06-07-2026)

A meal-plan enhancement (slotted here in build order, like §10 Phase 8.4/8.5 — not part of
Phase 8's notifications theme; §8.6): a **Generate meal plan** button that fills a week's slots with
random recipes, so a household can start a week from a roll of the dice rather than a blank grid,
steer it with tags, reroll what it doesn't like, and clear a week to start over.

**Goal**: A week of meals in one click — steerable and re-rollable, without overwriting what you chose by hand.

**Delivered**: One migration (`meal_plan_generation`) adds `Recipe.mealTypes` (`MealType[]` — the slots
a recipe may auto-fill; empty = never auto-picked) and `MealPlanEntry.isGenerated` (generator-written
vs. hand-picked). Shared `@hame/shared` gains a **pure, deterministic generator** (`meal-plan-generate.ts`,
the same pure/impure split as the recurrence / reminder / chore-stats engines): `generateMealPlan`
picks a recipe per generatable slot from the recipes eligible for that meal type, honouring optional
per-meal-type **tag quotas** (a roast dinner ×2) and cycling a shuffled pool so a recipe only repeats
once the pool is exhausted — with an **injectable RNG** so it's unit-tested without randomness; plus
`pickForSlot` (a single-slot reroll that excludes the current pick where the pool allows). The
generate-shopping-list totals are untouched — this is the fuzzy front-end of planning, kept separate
from the deterministic shopping maths. Recipe / meal-plan schemas carry `mealTypes` / `isGenerated`,
and a `GenerateMealPlanSchema` / `ClearMealPlanSchema` cover the two new endpoints.

The API plumbs `mealTypes` through recipe create/update/reads and adds `POST /api/meal-plans/generate`
— which, in one transaction, clears its **own** prior generated entries in the range for the given
meal types then writes the accepted picks as generated, but **skips any cell holding a manual entry**,
so a hand-picked meal is never overwritten (only a re-generate on a slot it doesn't occupy replaces the
previous auto-pick) — and `POST /api/meal-plans/clear`, which wipes every entry in a range (manual and
generated alike) for the "start from scratch" button. The client rolls the picks locally (instant
preview + reroll) and the server only persists — random selection is inherently interactive, so unlike
generate-shopping-list the arithmetic-free roll happens client-side and the server is the source of
truth for what's saved.

Web: a per-recipe **Meal slots** pill selector on the recipe form; a **Generate meal plan** dialog —
optional tag-quota rules per meal type, a proposal previewed as a 7-day grid with a **per-day 🎲
reroll** and a **whole-week "Reroll all"**, manual entries shown locked (🔒) and never rolled, then
**Apply to week** — and a confirm-gated **Clear week** button (shown only when the week has meals). A
household with no recipes marked for the enabled slots gets a plain-English nudge to set Meal slots
first rather than an empty roll. Verified: typecheck / lint / format green, **418 tests** (375 API + 43
web; incl. the generator's eligibility / no-repeat / quota-cap / quota-skip / variety-fill cases, the
single-slot reroll exclusion, and the apply service's clear-generated / skip-manual / unknown-recipe
and clear-range cases), all builds clean, plus the new `/generate` and `/clear` routes confirmed
mounted behind auth on the live server.

### Phase 8.8 — Data Integrity (Backup & Restore) ✅ Complete (09-07-2026)

A full **export/import** so a household survives a dead server, migrates to new
hardware, or keeps off-box backups (§8.15, §9.8). Slotted here in build order
(like §10 Phase 8.4 / 8.5 / 8.7 — not part of Phase 8's notifications theme).

**Goal**: If the server dies, one file brings the whole household back.

**Delivered**: No migration and no new model — the backup reads and writes the
existing tables. Shared `@hame/shared` gains the backup contract: the ordered
`BACKUP_MODELS` (parents-first, for FK-safe inserts) and `BACKUP_JOIN_TABLES`
lists, the `BACKUP_SECRET_FIELDS` map, and the envelope / manifest / payload /
request Zod schemas — with an API coverage test asserting the lists track the
Prisma schema, so adding a model or an implicit m2m relation without listing it
fails a test rather than silently dropping a table from every backup (§9.8). The
API adds `lib/backup-crypto` (an argon2id KDF stretches the passphrase into a key
that seals the whole file with AES-256-GCM and is stored nowhere; a wrong
passphrase fails the GCM auth tag as a clean 400) and a `backup` service that
dumps and reloads every table through Postgres' own `json_agg` /
`json_populate_recordset` — so arrays, JSON, enums, dates and nulls round-trip
faithfully and timestamps are preserved exactly — decrypting the three at-rest
secrets into the file on export and re-encrypting them under the **target**
instance's `ENCRYPTION_KEY` on import. Import verifies the passphrase,
**version-gates** against `_prisma_migrations` (refusing a mismatched schema),
integrity-checks the row counts against the manifest, then in one transaction
truncates and reloads with UUIDs preserved (every foreign key lines back up) and
reconnects the Home Assistant socket. An admin-only, CSRF-protected `backup`
slice exposes `POST /api/backup/export` (the encrypted file) and
`POST /api/backup/import` (the envelope in the body, parsed by a route-scoped
100 MB limit). Web: an admin **Settings → Data** card — a passphrase then
**Download backup** (saved client-side as a blob), and a file + passphrase
**Restore** behind an erase-and-replace confirm dialog that reloads afterwards so
the auth gate re-runs (signing you back in, or out if your account isn't in the
backup). The README documents the in-app feature alongside a `pg_dump` /
`pg_restore` + Compose-volume ops path.

Verified: typecheck / lint / format green, **442 tests** (384 API + 43 web + 15
bin-scraper; incl. the table-coverage guard against the live Prisma DMMF, the
seal/open round-trip + wrong-passphrase + tamper, and the import
version-gate / integrity / wipe-reload-reconnect cases), all builds clean, plus a
**live end-to-end smoke**: export → mutate → restore round-tripped 610 rows
across all 29 tables and 4 join tables; a row added after the export was gone
afterwards (wipe-and-replace); the WiFi secret decrypted to its original with a
**different ciphertext blob** (correctly re-keyed under this instance's key); and
every guard held — wrong passphrase / malformed file 400, unauthenticated 401,
member 403, missing CSRF 403.

### Phase 8.9 — Automated on-disk backups ✅ Complete (11-07-2026)

Extends the manual backup/restore (§8.8, §8.15) with **scheduled, rolling,
on-disk** backups, so a household that never clicks "Download" still has recent
backups — and, critically, backups that **survive a dead container or database**
because they live on a host-mounted directory, not in the DB or the container.
Slotted here in build order (like §10 Phase 8.4 / 8.5 / 8.7 / 8.8).

**Goal**: Backups happen on their own, roll over automatically, and sit somewhere
that outlives the container and the database.

**Delivered**: One migration (`phase_8_9_backup_settings`) adds the
`BackupSettings` singleton (§7.8) — `enabled`, `frequency` (`DAILY`/`WEEKLY`) +
`hour`/`weekday`, `retentionCount` (default 7), a `passphrase` **AES-256-GCM
encrypted at rest** (never returned — the `hasPassphrase` shape), and
`lastRunAt`/`lastStatus`/`lastError` — added to `BACKUP_MODELS` +
`BACKUP_SECRET_FIELDS` so it round-trips through a backup (the coverage guard
enforces this). Shared `@hame/shared` gains the settings/update/run Zod schemas
and a **pure, UTC/DST-free scheduling engine** (`backup-settings.ts`:
`isBackupDue` / `mostRecentScheduledSlot` / `nextScheduledSlot`), the same
pure/impure split as the recurrence / reminder / chore-stats engines. The API
reuses `exportBackup` **verbatim** and adds only the sink + trigger: a
`writeScheduledBackup` seals the envelope to `BACKUP_DIR` and prunes the oldest
past `retentionCount` (ISO-timestamped filenames sort lexicographically, so
"newest N" is a sort-and-slice), a `runBackupNow` (records the outcome, rethrows)
and a never-throwing `runBackupTick` (graceful-degrade, §9.6). A fixed **hourly**
`node-cron` job reads the DB-held schedule and acts only when `isBackupDue` — so
the schedule is runtime-adjustable without rescheduling cron, and a slot **missed
while the container was down is caught up** on the next tick and shortly after
boot (the notification-job "coarse tick, act at the slot" shape). Admin-only,
CSRF-protected `GET`/`PATCH /api/backup/settings` + `POST /api/backup/run`; files
written `0o600` in a `0o700` dir. Deployment: a new `BACKUP_DIR` env, a host
bind-mount in `docker-compose.prod.yml` (`${BACKUP_DIR_HOST:-./backups}:/data/backups`),
`.env.example` docs, and `backups/` git-ignored (the files carry hashes +
secrets, even sealed). Web: an admin **Settings → Automated backups** card —
toggle, frequency/hour/weekday, retention, the seal passphrase ("leave blank to
keep"), **Back up now**, and a last-run / next-run status line — alongside the
existing Data (backup & restore) card, which still handles restore.

Verified: typecheck / lint / format green, **498 tests** (440 API + 43 web + 15
bin-scraper; incl. the `isBackupDue` / slot / catch-up cases, `pruneBackups`
retention + non-backup-file safety + missing-dir, and the settings service's
encrypt-at-rest / never-return / omit-preserves / enable-requires-passphrase),
all builds clean, plus a **live end-to-end smoke against the real dev DB + disk**:
enabling without a passphrase refused; a backup written, decrypted with the
passphrase (real seeded rows inside), a wrong passphrase rejected; rolling
retention keeping exactly the configured count while writing more; and the run
recorded as `SUCCESS`. The one remaining battle-test is a live prod boot with the
host bind-mount on the homelab (like the HA / Immich / TrueNAS smokes).

### Phase 9 — Polish & Portfolio Prep ✅ Presentable core (11-07-2026)

Comprehensive README, demo data seed script, architecture diagrams, tests for critical flows, production Docker setup, blog post draft.

**Goal**: CV-ready, link-able from portfolio.

**Delivered (the presentable core).** The portfolio-facing surface, so the engineering is visible to a reviewer who never runs `pnpm dev`. The **README** is restructured to lead with the product — hero screenshots (wall-tablet dashboard light/dark), a grouped feature tour, and an **architecture** section: a Mermaid system diagram (clients → Cloudflare/nginx → web · API · shared → Postgres, with the API's outbound Home Assistant WebSocket / Immich / Ollama / iCal / integration providers and inbound CalDAV) plus the load-bearing decisions (monorepo + shared-Zod single-source-of-truth, thin-controllers/thick-services, the live HA WebSocket, the pluggable provider seams, encrypted re-keyable backups). All the existing getting-started / optional-features / backup content is retained lower down under one **Configuration & optional features** heading, and a new **Security** section surfaces the real strengths (argon2, AES-256-GCM at rest, CSRF + token-version session revocation, the `safeFetch` SSRF guard, CSP, passphrase-encrypted backups). A new `docs/screenshots/` directory carries a capture **shot-list** with the exact filenames the README embeds, so screenshots drop into place with no README edits — captured from a live instance for the richest result (real HA weather/smart-home, Immich screensaver, real data).

The **demo seed** (`apps/api/prisma/seed.ts`) is extended so a fresh `pnpm db:seed` photographs well: three colour-token manual **bins** (a weekly bin plus two alternating fortnightly bins anchored so the next collection lands within the coming fortnight) so "Next bin day" and the calendar populate, and a few household **calendar events** (a timed appointment, a dinner, an all-day weekend) built through the same shared `buildEventICal` / `icalEtag` the event service uses — both idempotently guarded like the rest of the seed, no schema change. The production **`docker-compose.prod.yml`** (which predated Phases 5–10) is brought in line with the current env surface — `LOCAL_NETWORK_CIDRS`, the four `*_SYNC_CRON` / `NOTIFICATION_CRON` schedules and `CALDAV_PUBLIC_URL` passed through with `${VAR:-default}` fallbacks — with an API `/api/health` healthcheck and `web` gated on api-healthy; nginx already routes `/api`, `/caldav` and `/.well-known/caldav` (verified, unchanged).

Verified: the extended seed run against a fresh throwaway database (three bins + three events created with sensible near-future dates, then dropped, leaving the working DB untouched thanks to the count guards), typecheck / lint / format / tests green, and `docker compose -f docker-compose.prod.yml config` validates the merged env. A full prod `up -d --build` boot remains a live deployment check.

**Deferred / flagged, not done this pass.** The **blog-post draft** is a separate focused writing session (§13 deliverables). Two items are left as open decisions: compiling the API to JS to run under `node` rather than `tsx` at runtime (removes the interpreted-TS-in-prod smell, but needs a build-config + live-boot verification), and adding a **LICENSE** ahead of open-sourcing. Web test coverage was not expanded — the API suite is strong and the frontend is thin, a later focused add if wanted.

### Phase 10 — Integrations Framework

Generalise the two existing provider seams (pluggable bin sources §9.6, calendar
sources §8.10) into one first-class **integration provider** abstraction (§9.9),
so external self-hosted services surface on Hame's dashboard and calendar through
a single, transport-agnostic interface. A new integration becomes **one module +
a registry entry** — the same contribution model as adding a council to
`packages/bin-scraper`.

**Goal**: A household — or a contributor via PR — can wire a self-hosted service
into Hame's dashboard/calendar without touching the core: config-driven,
read-only, inside the Phase 8.6 security envelope.

**Design**:

- **`IntegrationProvider` interface** — first-party modules under
  `apps/api/src/integrations/<id>/`, registered in a registry map (the PR seam).
  A provider declares its `id`, its `kind` (`STATUS` | `CALENDAR`), and the
  `configFields` / `secretFields` it needs (driving a generic settings form +
  test-connection), and owns its transport — the framework only sees normalised
  output.
- **`Integration` + `IntegrationEvent` models** (§7.8) — a configured instance:
  provider id, kind, label, non-secret `config`, an AES-256-GCM-encrypted
  `secret` (§11, never returned — the `hasToken` pattern from HA/Immich), poll
  interval, the last `snapshot` (STATUS) or cached `events` (CALENDAR), and
  `lastSyncedAt` / `lastError`. A Phase 10 migration adds them; both join
  `BACKUP_MODELS` and `Integration.secret` joins `BACKUP_SECRET_FIELDS`, so
  backups round-trip and re-key it (§9.8).
- **Poller** in the `BIN_SYNC_CRON` mould — each active integration refreshes on
  its interval; a failed poll keeps the last good snapshot/events and records
  `lastError` (graceful-degrade, §9.6). CALENDAR replaces its `IntegrationEvent`
  rows wholesale, which the aggregated calendar (§9.5) unions in.
- **Two output kinds only.** STATUS → a **generic status widget** rendering any
  provider's `{ label, value, state }` metrics uniformly (no bespoke React per
  provider — the line that keeps this a framework, not a code-store). CALENDAR →
  the existing aggregated calendar. The `feed` / list kind and the write-shaped
  `action` / control kind are out of scope (§12).
- **Security.** Admin-only, CSRF-protected, secrets encrypted at rest. Because
  integrations are admin-configured LAN services, their outbound HTTP is **exempt
  from the `safeFetch` private-IP block** (like HA/Immich/Ollama, §8.6) — which
  is exactly why a first-party provider beats pasting a LAN URL into a generic
  iCal/URL field.

Split into sub-phases, each landing green (mirroring 6.x / 7.x):

#### Phase 10.1 — Provider framework + Gitea (reference) ✅ Complete (10-07-2026)

The abstraction end-to-end on the **simplest** transport: the
`IntegrationProvider` interface + registry, the `Integration` / `IntegrationEvent`
models + migration + backup wiring, the poller, the shared `@hame/shared` Zod
contracts, and an admin **Settings → Integrations** slice (list / add / edit /
delete / test). The reference provider is **Gitea/Forgejo milestones** — a plain
HTTP `GET /api/v1/repos/{owner}/{repo}/milestones` (or the cross-repo issue
search) with `Authorization: token` header auth, projecting `due_on` into
`IntegrationEvent`s on the calendar. Built against Gitea's `/api/v1`; Forgejo ≥ 12
has diverged its API, so compatibility is verified and noted rather than assumed.
Proves the framework — config form, encrypted secret, LAN-exempt fetch, poller,
calendar bridge — against a real provider before a second transport or kind
exists.

#### Phase 10.2 — TrueNAS status provider + status widget ✅ Complete (10-07-2026)

The second axis: a **STATUS** provider over a **WebSocket JSON-RPC** transport.
TrueNAS Scale (25.04+; the REST API is removed in TrueNAS 26) connects over
JSON-RPC 2.0, authenticates with a **service-account API key**, and calls
read-only methods (`system.info`, `pool.query`, `disk.query`, `reporting.*`) —
connect → auth → call → close per poll, reusing the `ws` patterns from the HA
client (§10 Phase 6.1). Its normalised snapshot renders through a new **generic
status dashboard widget**. With 10.1 this exercises the framework across both
transports (HTTP ↔ WebSocket) and both kinds (calendar ↔ status) — proving the
abstraction against real spread, not one happy path.

#### Phase 10.3 — Settings UX + contributor docs ✅ Complete (10-07-2026)

Polish Settings → Integrations (dynamic provider-driven forms, test-connection
feedback, per-instance active / last-synced / last-error state, a pause/resume
toggle) and write a **"how to add a provider"** guide
(`apps/api/src/integrations/providers/README.md`) mirroring the
`packages/bin-scraper` README, plus an end-user Integrations section in the root
README, so both the PR seam and the feature are documented.

**Verified**: typecheck / lint / format green across all packages, **412 API + 43
web + 15 bin-scraper tests** — incl. the Gitea milestone mapping / registry /
mocked-fetch, the integration service's secret-at-rest / kind-derivation /
graceful-poll / wholesale-event-replace, the aggregated-calendar merge, the
TrueNAS status mapping / ws-URL derivation / formatters, and the backup +
dashboard-widget coverage guards accepting the two new models and the widget type
— all builds clean. Live smoke: the API boots with the integration poller
scheduled and both `/api/integrations` (admin) and `/api/integrations/status`
(member) mount behind their auth gates. Verified live end-to-end (10-07-2026)
against real servers: a Gitea repo's milestone due-dates on the calendar, and a
TrueNAS Scale's pools/system on the System status widget.

### Phase 11 — QuickNotes (Household Noteboard) ✅ Complete (12-07-2026)

A lightweight household "fridge board" (§8.16): short, glanceable notes surfaced
on every dashboard and the wall-tablet screensaver (household-wide), or as a
private direct note to one member. Deliberately **not** a chat app — the frame is
the ambient wall surface Hame uniquely has, which the phones in everyone's pocket
already beat at conversation.

**Goal**: Leave a note on the wall — for the whole house, or for one person.

**Design**:

- **`Note` + `NoteAck` models + `NoteAudience` enum** (§7.9) — a Phase 11
  migration adds them; both join `BACKUP_MODELS` (§9.8) so notes round-trip
  through backup/restore, and `NotificationPreference` gains `directNoteAlerts`.
- **Viewer-scoped feed.** `GET /api/notes` returns household notes **plus the
  caller's own direct notes only** — the privacy invariant is a query, not UI
  (§8.16), so the shared tablet paging a member's dashboard (as the `TABLET`
  account) can never surface that member's private note.
- **Ephemeral by default.** Optional `expiresAt` (default `now + 7 days`), pinned
  = never; a nightly `node-cron` sweep hard-deletes past-expiry rows (the §9.6
  graceful mould). Per-user "Got it" dismiss via `NoteAck` hides a household note
  from one board without removing it for the rest.
- **Three surfaces, all existing seams.** A `quickNotes` dashboard widget (§8.12),
  a `notes` screen in the idle rotation ring (§8.14, household-only,
  skip-when-empty), and a direct-note push through the existing notification
  engine (§8.13).
- **Shared Zod contract** in `@hame/shared` drives both the compose form and API
  validation.

**Delivered**: A single Phase 11 migration adds `Note`, `NoteAck` and the
`NoteAudience` enum (both models join `BACKUP_MODELS`, §9.8; `NotificationPreference`
gains `directNoteAlerts`). Shared `@hame/shared` carries the QuickNotes Zod
contract — a `CreateNoteSchema` whose refinement makes a DIRECT note require a
recipient and a HOUSEHOLD note refuse one, a body cap, and the viewer-relative
public `Note` shape (`mine` / `dismissed` / `recipientSeenAt`). The API `notes`
slice (thin controller, thick service) implements the viewer-scoped feed as a
**query** (household ∪ the caller's own direct notes) so the privacy invariant is
structural, per-user "Got it" dismiss via `NoteAck`, author/admin delete, a
best-effort direct-note push through the existing HA notify path, and a nightly
`NOTE_SWEEP_CRON` job that hard-deletes past-expiry notes (pinned = no expiry).
Web: a `quickNotes` dashboard widget (in the default layout) with a compose dialog
— audience toggle, member picker hidden for the tablet account, pin — plus a
`notes` screen wired into the idle screensaver ring (household-only,
skip-when-empty) and a `directNoteAlerts` toggle in the notifications settings.

**Verified**: typecheck / lint / format green, **473 API + 45 web tests** (incl.
the schema refinements, the viewer-scoping / dismiss / seen-marking / expiry /
tablet-guard service cases, and the screensaver-ring inclusion), full build clean,
and a **live end-to-end smoke** across three accounts — a household note (with a
7-day expiry) and a direct note posted; the direct note visible to its author and
recipient but **absent from the shared tablet's feed**; the recipient's view
recording a "seen" receipt back to the author; the tablet refused a direct note
(403); a per-user dismiss hiding a household note for one member only; and a
non-author delete refused (403).

### Phase 12 — Household alerts (critical ping) ✅ Complete (22-07-2026)

A one-off, person-to-person **urgent ping** from the phone: a bell icon on the
mobile top bar opens a modal to pick a household member (or, in a two-person house,
go straight to them), type a short message, and land it on their phone as a
**critical alert** that rings through silent mode / Do Not Disturb. It's the "come
here / dinner's ready / I need you now" affordance — distinct from QuickNotes (a
persistent fridge board) and from the twice-daily reminder batch. Fire-and-forget:
nothing is persisted.

**Goal**: From your phone, urgently reach someone else in the house — right now.

**Delivered**: A one-field Phase 12 migration adds `HouseholdSettings.householdAlertsEnabled`
(default **on**) — an admin toggle so a household that doesn't want the feature turns
it off and the icon disappears for everyone. No new model (the alert itself persists
nothing), and `HouseholdSettings` is already in `BACKUP_MODELS` (§9.8), so the column
round-trips through backup/restore for free. The whole feature **reuses the Phase 8
notify path**: `sendHaNotification` + the existing `criticalAlertData()` payload (iOS
`push.sound.critical` + Android `priority:high`/`ttl:0`), so Hame stands up no new push
infrastructure — HA owns the push. Shared `@hame/shared` gains the alert contract — a
`SendAlertSchema` (recipient + a 1–200 char message) and the viewer-facing
`AlertRecipientsResponse` (`enabled` / `haConfigured` flags + the other members, each
carrying `canReceive` = "has picked a phone").

A new `alerts` API slice (thin controller, thick service) exposes a member-level
`GET /api/alerts/recipients` (every *other* real person — never the caller, never the
tablet — with reachability) and `POST /api/alerts`. The send path is **always critical
and deliberately independent of the recipient's reminder prefs** (`pushViaHA` /
`criticalAlerts` are for scheduled reminders; an intentional human-to-human alert
overrides them) — the only requirement is that the recipient has picked a phone
(`NotificationPreference.haNotifyService`); absent, it returns `delivered:false` (not an
error) so the UI can say "hasn't set up their phone" rather than fail silently. The
household toggle is enforced on **both** the picker and the send path (a disabled house
403s a crafted POST, not just hides the icon), and the tablet account can neither send
(403) nor see the icon.

Web: a `useAlertRecipients` / `useSendAlert` hook pair and an `AlertButton` that renders
**only** when the toggle is on, HA is connected, and there's ≥1 other member — so a
non-HA household, the wall tablet, or a house that turned it off never sees it. The
phone-only top bar gains the right-aligned bell; its modal skips the picker entirely
when there's exactly one other member (the two-person case) and otherwise lists members
with unreachable ones disabled and labelled. An admin **Household alerts** card
(Settings → Smart home) drives the toggle. Verified: typecheck / lint / format green,
**502 API + 45 web tests** (incl. recipients excluding self/tablet, `canReceive` from the
phone target, toggle-off → empty recipients + send refused, the always-critical title /
payload, and the self / non-person / tablet / no-HA guards), all builds clean.

---

## 11. Security & Conventions

### Security

- **Password hashing**: argon2 (current best practice)
- **JWT**: signed with strong secret from env, short expiry + refresh tokens
- **HA access token**: encrypted at rest using AES-256-GCM with key from env
- **Middleware**:
  - `helmet` for security headers
  - `cors` locked to allowed origins
  - `express-rate-limit` on the login endpoint `/api/auth/login` (5 attempts / 15 mins per IP) — scoped to the credential-guessing surface, not the whole `/api/auth` tree, so the per-page-load `/me` check and `/logout` aren't throttled — plus a coarse per-client limiter across the whole `/api`, and a failed-attempt limiter on the CalDAV server (Phase 8.6). Every limiter keys on `CF-Connecting-IP` so external clients don't share one Cloudflare edge-IP bucket.
- **Trust proxy / real client IP**: the app sits behind Cloudflare + a reverse proxy, so Express must set `trust proxy` correctly and derive the client IP from `CF-Connecting-IP`. Otherwise every request appears to come from a proxy IP and the per-IP rate limit collapses into a single shared bucket. Do **not** blindly trust `X-Forwarded-For` (spoofable) — pin to the known proxy.
- **CSRF**: because JWT is stored in an httpOnly cookie, cookie-based requests need CSRF protection — set `SameSite=Lax` (or `Strict`) on the auth cookie and add a double-submit CSRF token for state-changing routes. (Bearer-token requests are exempt.)
- **Session revocation**: the session JWT carries a `User.tokenVersion`; a password or role change bumps it and `requireAuth` rejects any stale token, so outstanding sessions are invalidated at once (Phase 8.6).
- **SSRF guard on outbound fetches**: user-supplied URLs (recipe import, iCal feeds) go through a shared `safeFetch` that refuses non-http(s) schemes and hosts resolving to loopback/private/link-local/reserved addresses, re-checking each redirect hop. Admin-configured integrations (HA/Immich/Ollama), which legitimately target the LAN, are exempt (Phase 8.6).
- **Content-Security-Policy** and companion headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) on the served HTML; user URL fields are constrained to http(s) at the Zod schema to prevent `javascript:`-scheme stored XSS (Phase 8.6).
- **Backups**: the logical export (§8.15) is **always** passphrase-encrypted — an argon2id-derived key + AES-256-GCM over the whole file — because it contains argon2 password hashes and the decrypted integration secrets. Import re-encrypts those secrets under the target instance's `ENCRYPTION_KEY`. Export/import are admin-only, CSRF-protected and rate-limited (Phase 8.8).
- **Env vars** validated at startup with Zod — fail fast if misconfigured (`JWT_SECRET` ≥ 32 chars, `ENCRYPTION_KEY` 64 hex)
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

### Ingredient Normalisation

- Companion to LLM auto-tagging, scheduled as **Phase 4.5** (§10) — see that roadmap entry for the full design.
- Turns free-text recipe ingredients ("large tomato", "pinch of sugar") into clean `Item` data via one of three layered, swappable strategies selected per household: the regex parser (today), a bundled dictionary, or an LLM.
- Reuses the same self-hosted **Ollama** as auto-tagging. The LLM normalises names/quantities and flags staples; the deterministic generate-shopping-list (§8.6) keeps doing the maths.

### UK Bin Scraper (Standalone Package, to be extracted)

- **Built** as the `SCRAPER` provider behind the Phase 5.6 bin-source seam (§10) — Hame already had the model, cache, sync and cron; this is the data source that fills it.
- Lives **in-monorepo** as `packages/bin-scraper` (package name `uk-bin-scraper`) for a tight iteration loop, **to be extracted to its own repo** once a few councils are proven. Dependency-free (native `fetch` + targeted regex), so it stays portable.
- Modular per-council adapters behind one interface — `findAddresses(query)` (setup-time street/postcode lookup) + `fetchObservation(addressId)` — plus a pure `projectBinDates(...)` that turns one reading into concrete dates. Parsers are fixture-tested against saved real council HTML.
- Key design note: councils rarely publish concrete future dates, only "this week" + weekday/frequency, so the model is **observe-then-project** with a `priorAnchor` carried across syncs to pin 4-weekly cycles (see §10 Phase 5.6).
- First council adapter shipped; further councils are added one module at a time. An LLM is used only as a dev aid for reverse-engineering a new council's page, never at runtime.
- Blog post: _"How I Scraped My Council's Website to Automate Bin Reminders"_

### Integration Providers — Further Kinds

The Phase 10 integration framework (§9.9, §10) ships two read-only output kinds,
`STATUS` and `CALENDAR`. Two more are consciously left out:

- **`feed` (ordered list)** — the third read-only shape: a list of non-dated
  items (recent documents, unread articles, recently-added media) rendered as a
  list widget. Rounds out the taxonomy (metrics / events / feeds); a natural
  later 10.x. A good example would be a LAN service behind a token (e.g.
  Paperless-ngx, FreshRSS) so it justifies the framework over a plain RSS URL.
- **`action` / control (non-goal)** — an integration that _does_ things (restart
  a container, run a job) means write access to LAN services. It breaks the
  read-only security envelope (§8.6) and overlaps Home Assistant's control lane,
  so it is deliberately excluded, not merely unbuilt.

### Other Down-the-Line Features

- Budget & bill tracking
- Energy monitoring widget (HA energy data)
- Camera feeds (ONVIF/RTSP) — a Cameras page + dashboard widget showing live IoT camera streams. Browsers can't play RTSP directly, so front the cameras with an off-the-shelf media gateway (e.g. **go2rtc**, already used under the hood by Home Assistant) that repackages RTSP → WebRTC/HLS; Hame owns the authenticated UI + credential-hiding backend proxy (the Immich-proxy pattern, §8.14), **not** the media engine. Remote viewing is the real cost — WebRTC + TURN for sub-second latency vs HLS over the existing proxy (simpler, higher latency, Cloudflare-ToS gray area for sustained video) vs a VPN (Tailscale/WireGuard, best quality, remote device must join). Check whether the cameras emit H.264 (cheap passthrough) or H.265 (needs transcoding — real CPU per stream). Keep the cameras on an isolated, internet-less VLAN reachable only via the gateway.
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
- **Authenticated, portable backups** — a passphrase-derived (argon2id) AES-256-GCM whole-file export, re-keyable across instances, with a preserve-UUID transactional restore (§8.15)
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
