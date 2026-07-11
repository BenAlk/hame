import type { RequestHandler } from 'express'
import type { ExportBackupInput, ImportBackupInput, UpdateBackupSettingsInput } from '@hame/shared'
import { exportBackup, importBackup, runBackupNow } from '../services/backup.service.js'
import { getBackupSettings, updateBackupSettings } from '../services/backup-settings.service.js'

/** Admin-only full-database export → a passphrase-encrypted envelope (spec §8.15). */
export const exportBackupController: RequestHandler = async (req, res, next) => {
  try {
    const { passphrase } = req.body as ExportBackupInput
    const envelope = await exportBackup(passphrase)
    const filename = `hame-backup-${new Date().toISOString().slice(0, 10)}.json`
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.json(envelope)
  } catch (err) {
    next(err)
  }
}

/** Admin-only restore — wipes and replaces all data from a backup (spec §8.15). */
export const importBackupController: RequestHandler = async (req, res, next) => {
  try {
    const { passphrase, envelope } = req.body as ImportBackupInput
    res.json(await importBackup(passphrase, envelope))
  } catch (err) {
    next(err)
  }
}

/** Admin-only read of the automated-backup schedule (spec §10 Phase 8.9). */
export const getBackupSettingsController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getBackupSettings())
  } catch (err) {
    next(err)
  }
}

/** Admin-only update of the automated-backup schedule (spec §10 Phase 8.9). */
export const updateBackupSettingsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateBackupSettings(req.body as UpdateBackupSettingsInput))
  } catch (err) {
    next(err)
  }
}

/** Admin-only "Back up now" — writes a backup to disk immediately (spec §10 Phase 8.9). */
export const runBackupController: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await runBackupNow())
  } catch (err) {
    next(err)
  }
}
