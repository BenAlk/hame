import { Router } from 'express'
import { ExportBackupSchema, ImportBackupSchema } from '@hame/shared'
import { validateBody } from '../middleware/validate.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { verifyCsrf } from '../middleware/csrf.js'
import { exportBackupController, importBackupController } from '../controllers/backup.controller.js'

export const backupRouter = Router()

// Full data export/import (spec §8.15) — admin-only, CSRF-protected. Both are
// heavy; the coarse per-client API limiter (app.ts) is the backstop. The import
// body (the whole database) is parsed by a route-scoped large limit in app.ts.
backupRouter.post(
  '/export',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(ExportBackupSchema),
  exportBackupController,
)
backupRouter.post(
  '/import',
  requireAuth,
  requireAdmin,
  verifyCsrf,
  validateBody(ImportBackupSchema),
  importBackupController,
)
