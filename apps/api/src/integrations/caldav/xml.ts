/**
 * Minimal XML helpers for the CalDAV server (spec §10 Phase 5.5). Responses are
 * built from template strings; requests are read with targeted regex rather than
 * a full XML parser — enough for the handful of element shapes DAVx5 sends,
 * keeping the server dependency-free.
 */
import type { Request } from 'express'

export const XML_DECL = '<?xml version="1.0" encoding="utf-8"?>'
export const NS =
  'xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/"'

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The `Depth` header, defaulting to infinity per RFC 4918. */
export function depthOf(req: Request): '0' | '1' | 'infinity' {
  const d = req.header('Depth')
  return d === '0' || d === '1' ? d : 'infinity'
}

export type ReportKind = 'calendar-query' | 'calendar-multiget' | 'unknown'

export function reportKind(body: string): ReportKind {
  if (/calendar-multiget/.test(body)) return 'calendar-multiget'
  if (/calendar-query/.test(body)) return 'calendar-query'
  return 'unknown'
}

/** Extract the `<href>` values from a request body (namespace-agnostic). */
export function extractHrefs(body: string): string[] {
  const out: string[] = []
  const re = /<(?:\w+:)?href>\s*([^<]+?)\s*<\/(?:\w+:)?href>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) out.push(m[1])
  return out
}

/** Wrap `<response>` entries in a DAV multistatus document. */
export function multistatus(responses: string[]): string {
  return `${XML_DECL}\n<d:multistatus ${NS}>\n${responses.join('\n')}\n</d:multistatus>\n`
}

/** A `<response>` whose props all succeed (200). */
export function okResponse(href: string, propsXml: string): string {
  return (
    `  <d:response>\n` +
    `    <d:href>${escapeXml(href)}</d:href>\n` +
    `    <d:propstat>\n      <d:prop>\n${propsXml}\n      </d:prop>\n` +
    `      <d:status>HTTP/1.1 200 OK</d:status>\n    </d:propstat>\n` +
    `  </d:response>`
  )
}
