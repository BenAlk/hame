import type { RequestHandler } from 'express'
import type { ExportBackupInput, ImportBackupInput } from '@hame/shared'
import { exportBackup, importBackup } from '../services/backup.service.js'

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
