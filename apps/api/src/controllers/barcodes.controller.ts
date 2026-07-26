import type { RequestHandler } from 'express'
import { BarcodeSchema, type LinkBarcodeInput } from '@hame/shared'
import { HttpError } from '../lib/http-error.js'
import { linkBarcode, resolveBarcode, unlinkBarcode } from '../services/barcode.service.js'

/** The code arrives as a path param, so it's validated here rather than by `validateBody`. */
function parseCode(raw: string): string {
  const parsed = BarcodeSchema.safeParse(raw)
  if (!parsed.success) throw HttpError.badRequest('A barcode is 8–14 digits')
  return parsed.data
}

export const resolveBarcodeController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await resolveBarcode(parseCode(req.params.code)))
  } catch (err) {
    next(err)
  }
}

export const linkBarcodeController: RequestHandler = async (req, res, next) => {
  try {
    await linkBarcode(req.body as LinkBarcodeInput, req.user!.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export const unlinkBarcodeController: RequestHandler = async (req, res, next) => {
  try {
    await unlinkBarcode(parseCode(req.params.code))
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
