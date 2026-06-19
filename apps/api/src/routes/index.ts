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
import { petsRouter } from './pets.js'
import { choresRouter } from './chores.js'
import { choreInstancesRouter } from './chore-instances.js'

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
apiRouter.use('/pets', petsRouter)
apiRouter.use('/chores', choresRouter)
apiRouter.use('/chore-instances', choreInstancesRouter)
