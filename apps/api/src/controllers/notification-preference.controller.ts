import type { RequestHandler } from 'express'
import type { UpdateNotificationPreferenceInput } from '@hame/shared'
import {
  getNotificationPreference,
  updateNotificationPreference,
} from '../services/notification-preference.service.js'

/** A user's own notification preferences (spec §8.13, §10 Phase 8) — member-level. */
export const getNotificationPreferenceController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getNotificationPreference(req.user!.id))
  } catch (err) {
    next(err)
  }
}

export const updateNotificationPreferenceController: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await updateNotificationPreference(
        req.user!.id,
        req.body as UpdateNotificationPreferenceInput,
      ),
    )
  } catch (err) {
    next(err)
  }
}
