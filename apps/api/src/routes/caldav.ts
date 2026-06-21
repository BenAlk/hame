/**
 * CalDAV server (spec §10 Phase 5.5). A small but DAVx5-compatible surface:
 * discovery (PROPFIND for principal / calendar-home-set), several calendar
 * collections — a read-write "Household" events calendar plus read-only derived
 * "Meals" / "Chores" / "Bins" (v2) — the `calendar-query` / `calendar-multiget`
 * REPORTs, and GET/PUT/DELETE of `.ics` resources with ETag concurrency.
 * `sync-collection` is intentionally omitted (clients fall back to getctag +
 * getetag diffing). Gated on the household `caldavEnabled` toggle and
 * authenticated with per-user app passwords (HTTP Basic).
 */
import { Router, text } from 'express'
import type { Request, Response } from 'express'
import { getHouseholdSettings } from '../services/household-settings.service.js'
import { caldavAuth } from '../middleware/caldav-auth.js'
import {
  CALDAV_COLLECTIONS,
  deleteCalDavObject,
  getCollection,
  putCalDavObject,
  type CalDavCollection,
  type CalDavResource,
} from '../services/caldav.service.js'
import {
  depthOf,
  escapeXml,
  extractHrefs,
  multistatus,
  okResponse,
  reportKind,
} from '../integrations/caldav/xml.js'

const BASE = '/caldav'
const PRINCIPAL = `${BASE}/principal/`
const HOME = `${BASE}/calendars/`

const COLLECTION_RE = /^\/calendars\/([^/]+)\/?$/
const RESOURCE_RE = /^\/calendars\/([^/]+)\/(.+)\.ics$/

function collectionHref(id: string): string {
  return `${BASE}/calendars/${id}/`
}
function resourceHref(collectionId: string, uid: string): string {
  return `${BASE}/calendars/${collectionId}/${encodeURIComponent(uid)}.ics`
}

/** Parse a resource path into its collection + uid, or null if it isn't one. */
function parseResourcePath(path: string): { collectionId: string; uid: string } | null {
  const m = RESOURCE_RE.exec(path)
  return m ? { collectionId: m[1], uid: decodeURIComponent(m[2]) } : null
}

/** Strip surrounding quotes / weak-validator prefix from an ETag header. */
function normaliseEtag(value: string): string {
  return value.replace(/^W\//, '').replace(/^"|"$/g, '')
}

// ── prop fragments ───────────────────────────────────────────────────────────

const principalProps = [
  `        <d:resourcetype><d:collection/><d:principal/></d:resourcetype>`,
  `        <d:displayname>Hame</d:displayname>`,
  `        <d:current-user-principal><d:href>${PRINCIPAL}</d:href></d:current-user-principal>`,
  `        <d:principal-URL><d:href>${PRINCIPAL}</d:href></d:principal-URL>`,
  `        <cal:calendar-home-set><d:href>${HOME}</d:href></cal:calendar-home-set>`,
].join('\n')

const homeProps = [
  `        <d:resourcetype><d:collection/></d:resourcetype>`,
  `        <d:displayname>Calendars</d:displayname>`,
  `        <d:current-user-principal><d:href>${PRINCIPAL}</d:href></d:current-user-principal>`,
].join('\n')

function privilegeSet(readOnly: boolean): string {
  const privs = readOnly
    ? `<d:privilege><d:read/></d:privilege>`
    : `<d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege><d:privilege><d:write-content/></d:privilege>`
  return `        <d:current-user-privilege-set>${privs}</d:current-user-privilege-set>`
}

function collectionProps(coll: CalDavCollection, ctag: string): string {
  return [
    `        <d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>`,
    `        <d:displayname>${escapeXml(coll.displayName)}</d:displayname>`,
    `        <cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set>`,
    `        <x1:calendar-color xmlns:x1="http://apple.com/ns/ical/">${coll.colour}ff</x1:calendar-color>`,
    `        <cs:getctag>${ctag}</cs:getctag>`,
    privilegeSet(coll.readOnly),
    `        <d:current-user-principal><d:href>${PRINCIPAL}</d:href></d:current-user-principal>`,
  ].join('\n')
}

function resourceProps(etag: string, withData?: string): string {
  const lines = [
    `        <d:getetag>"${etag}"</d:getetag>`,
    `        <d:getcontenttype>text/calendar; charset=utf-8; component=vevent</d:getcontenttype>`,
  ]
  if (withData !== undefined)
    lines.push(`        <cal:calendar-data>${escapeXml(withData)}</cal:calendar-data>`)
  return lines.join('\n')
}

function resourceResponse(collectionId: string, obj: CalDavResource, withData = false): string {
  return okResponse(
    resourceHref(collectionId, obj.uid),
    resourceProps(obj.etag, withData ? obj.icalRaw : undefined),
  )
}

// ── method handlers ──────────────────────────────────────────────────────────

async function handlePropfind(req: Request, res: Response): Promise<void> {
  const path = req.path === '' ? '/' : req.path
  // Absolute request path (router is mounted at /caldav) so echoed hrefs match.
  const self = `${req.baseUrl}${path === '/' ? '/' : path}`
  send207(res, await propfindBody(path, self, depthOf(req)))
}

async function propfindBody(path: string, self: string, depth: string): Promise<string> {
  // Discovery roots answer with the principal so a client can chain forward.
  if (path === '/' || path.startsWith('/principal')) {
    return multistatus([okResponse(self, principalProps)])
  }
  // Calendar home: list every collection at Depth: 1.
  if (path === '/calendars' || path === '/calendars/') {
    const responses = [okResponse(HOME, homeProps)]
    if (depth !== '0') {
      for (const coll of CALDAV_COLLECTIONS) {
        responses.push(
          okResponse(collectionHref(coll.id), collectionProps(coll, await coll.ctag())),
        )
      }
    }
    return multistatus(responses)
  }
  // A collection: its props, plus every resource at Depth: 1.
  const collMatch = COLLECTION_RE.exec(path)
  if (collMatch) {
    const coll = getCollection(collMatch[1])
    if (!coll) return multistatus([])
    const responses = [
      okResponse(collectionHref(coll.id), collectionProps(coll, await coll.ctag())),
    ]
    if (depth !== '0') {
      for (const obj of await coll.list()) responses.push(resourceResponse(coll.id, obj))
    }
    return multistatus(responses)
  }
  // A single resource.
  const ref = parseResourcePath(path)
  const coll = ref ? getCollection(ref.collectionId) : null
  const obj = coll && ref ? await coll.get(ref.uid) : null
  return multistatus(obj && ref ? [resourceResponse(ref.collectionId, obj)] : [])
}

async function handleReport(req: Request, res: Response): Promise<void> {
  const collMatch = COLLECTION_RE.exec(req.path)
  const coll = collMatch ? getCollection(collMatch[1]) : null
  if (!coll) return void res.status(404).end()

  const body = typeof req.body === 'string' ? req.body : ''
  const all = await coll.list()
  let objects = all
  if (reportKind(body) === 'calendar-multiget') {
    const wanted = new Set(
      extractHrefs(body)
        .map((href) => parseResourcePath(href.replace(BASE, ''))?.uid)
        .filter((u): u is string => Boolean(u)),
    )
    objects = all.filter((o) => wanted.has(o.uid))
  }
  send207(res, multistatus(objects.map((obj) => resourceResponse(coll.id, obj, true))))
}

async function handleGet(req: Request, res: Response): Promise<void> {
  const ref = parseResourcePath(req.path)
  const coll = ref ? getCollection(ref.collectionId) : null
  const obj = coll && ref ? await coll.get(ref.uid) : null
  if (!obj) return void res.status(404).end()
  res.set('ETag', `"${obj.etag}"`)
  res.set('Content-Type', 'text/calendar; charset=utf-8')
  res.status(200).send(obj.icalRaw)
}

async function handlePut(req: Request, res: Response): Promise<void> {
  const ref = parseResourcePath(req.path)
  const coll = ref ? getCollection(ref.collectionId) : null
  if (!coll || !ref) return void res.status(403).end()
  if (coll.readOnly) return void res.status(403).end() // derived calendars aren't writable

  const ical = typeof req.body === 'string' ? req.body : ''
  const existing = await coll.get(ref.uid)
  const ifMatch = req.header('If-Match')
  const ifNoneMatch = req.header('If-None-Match')
  if (ifNoneMatch === '*' && existing) return void res.status(412).end()
  if (ifMatch && (!existing || normaliseEtag(ifMatch) !== existing.etag)) {
    return void res.status(412).end()
  }

  const result = await putCalDavObject(ref.uid, ical, req.caldavUserId!)
  if (!result) return void res.status(400).end() // unparseable iCalendar
  res.set('ETag', `"${result.etag}"`)
  res.status(result.created ? 201 : 204).end()
}

async function handleDelete(req: Request, res: Response): Promise<void> {
  const ref = parseResourcePath(req.path)
  const coll = ref ? getCollection(ref.collectionId) : null
  if (!coll || !ref) return void res.status(404).end()
  if (coll.readOnly) return void res.status(403).end()

  const obj = await coll.get(ref.uid)
  if (!obj) return void res.status(404).end()
  const ifMatch = req.header('If-Match')
  if (ifMatch && normaliseEtag(ifMatch) !== obj.etag) return void res.status(412).end()
  await deleteCalDavObject(ref.uid)
  res.status(204).end()
}

function send207(res: Response, xml: string): void {
  res.status(207).set('Content-Type', 'application/xml; charset=utf-8').send(xml)
}

// ── router ───────────────────────────────────────────────────────────────────

export const caldavRouter = Router()

// Raw text bodies (iCalendar / DAV XML), not JSON.
caldavRouter.use(text({ type: () => true, limit: '5mb' }))

// Gate on the household toggle — the whole tree 404s when CalDAV is off.
caldavRouter.use((_req, res, next) => {
  getHouseholdSettings()
    .then((s) => (s.caldavEnabled ? next() : res.status(404).end()))
    .catch(next)
})

caldavRouter.use(caldavAuth)

caldavRouter.use((req, res, next) => {
  const dispatch: Record<string, ((req: Request, res: Response) => Promise<void>) | undefined> = {
    OPTIONS: async (_req, r) => {
      r.set('DAV', '1, 3, calendar-access')
      r.set('Allow', 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT')
      r.status(200).end()
    },
    PROPFIND: handlePropfind,
    REPORT: handleReport,
    GET: handleGet,
    HEAD: handleGet,
    PUT: handlePut,
    DELETE: handleDelete,
  }
  const handler = dispatch[req.method]
  if (!handler) return void res.status(405).end()
  handler(req, res).catch(next)
})
