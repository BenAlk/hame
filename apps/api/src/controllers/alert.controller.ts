import type { RequestHandler } from 'express'
import type { SendAlertInput } from '@hame/shared'
import { listAlertRecipients, sendAlert } from '../services/alert.service.js'

export const listAlertRecipientsController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await listAlertRecipients({ id: req.user!.id, role: req.user!.role }))
  } catch (err) {
    next(err)
  }
}

export const sendAlertController: RequestHandler = async (req, res, next) => {
  try {
    const { recipientId, message } = req.body as SendAlertInput
    const sender = { id: req.user!.id, role: req.user!.role }
    res.json(await sendAlert(sender, recipientId, message))
  } catch (err) {
    next(err)
  }
}
