import type { RequestHandler } from 'express'
import type { UpdateWifiConfigInput } from '@hame/shared'
import { getWifiConfig, updateWifiConfig } from '../services/wifi-config.service.js'
import { isLocalRequest } from '../lib/network.js'

/** The household WiFi config feeding the QR widget (spec §10 Phase 7.2). The
 *  decrypted password is returned only to a local-network client (spec §11). */
export const getWifiConfigController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getWifiConfig(isLocalRequest(req)))
  } catch (err) {
    next(err)
  }
}

export const updateWifiConfigController: RequestHandler = async (req, res, next) => {
  try {
    res.json(await updateWifiConfig(req.body as UpdateWifiConfigInput, isLocalRequest(req)))
  } catch (err) {
    next(err)
  }
}
