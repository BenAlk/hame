import { Router } from 'express'
import { healthRouter } from './health.js'
import { setupRouter } from './setup.js'
import { authRouter } from './auth.js'
import { usersRouter } from './users.js'
import { tagsRouter } from './tags.js'
import { itemsRouter } from './items.js'
import { storageLocationsRouter } from './storage-locations.js'
import { pantryRouter } from './pantry.js'
import { shoppingListsRouter } from './shopping-lists.js'
import { consumablesRouter } from './consumables.js'
import { petsRouter } from './pets.js'
import { choresRouter } from './chores.js'
import { choreInstancesRouter } from './chore-instances.js'
import { recipesRouter } from './recipes.js'
import { mealPlansRouter } from './meal-plans.js'
import { householdSettingsRouter } from './household-settings.js'
import { ollamaConfigRouter } from './ollama-config.js'
import { homeAssistantConfigRouter } from './home-assistant-config.js'
import { binsRouter } from './bins.js'
import { customEventsRouter } from './custom-events.js'
import { calendarRouter } from './calendar.js'
import { calendarSourcesRouter } from './calendar-sources.js'
import { caldavCredentialsRouter } from './caldav-credentials.js'
import { dashboardRouter } from './dashboard.js'
import { wifiConfigRouter } from './wifi-config.js'
import { immichConfigRouter } from './immich-config.js'
import { idleRouter } from './idle.js'
import { notificationPreferencesRouter } from './notification-preferences.js'
import { statsRouter } from './stats.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/setup', setupRouter)
apiRouter.use('/auth', authRouter)
apiRouter.use('/users', usersRouter)
apiRouter.use('/tags', tagsRouter)
apiRouter.use('/items', itemsRouter)
apiRouter.use('/storage-locations', storageLocationsRouter)
apiRouter.use('/pantry', pantryRouter)
apiRouter.use('/shopping-lists', shoppingListsRouter)
apiRouter.use('/consumables', consumablesRouter)
apiRouter.use('/pets', petsRouter)
apiRouter.use('/chores', choresRouter)
apiRouter.use('/chore-instances', choreInstancesRouter)
apiRouter.use('/recipes', recipesRouter)
apiRouter.use('/meal-plans', mealPlansRouter)
apiRouter.use('/household-settings', householdSettingsRouter)
apiRouter.use('/ollama-config', ollamaConfigRouter)
apiRouter.use('/home-assistant', homeAssistantConfigRouter)
apiRouter.use('/bins', binsRouter)
apiRouter.use('/custom-events', customEventsRouter)
apiRouter.use('/calendar', calendarRouter)
apiRouter.use('/calendar-sources', calendarSourcesRouter)
apiRouter.use('/caldav-credentials', caldavCredentialsRouter)
apiRouter.use('/dashboard', dashboardRouter)
apiRouter.use('/wifi', wifiConfigRouter)
apiRouter.use('/immich', immichConfigRouter)
apiRouter.use('/idle', idleRouter)
apiRouter.use('/notification-preferences', notificationPreferencesRouter)
apiRouter.use('/stats', statsRouter)
