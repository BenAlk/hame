import { describe, it, expect } from 'vitest'
import type { Request } from 'express'
import {
  depthOf,
  escapeXml,
  extractHrefs,
  multistatus,
  okResponse,
  reportKind,
} from '../integrations/caldav/xml.js'

function reqWithDepth(value?: string): Request {
  return { header: (name: string) => (name === 'Depth' ? value : undefined) } as unknown as Request
}

describe('caldav xml helpers', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml('a & b < c > "d"')).toBe('a &amp; b &lt; c &gt; &quot;d&quot;')
  })

  it('reads the Depth header, defaulting to infinity', () => {
    expect(depthOf(reqWithDepth('0'))).toBe('0')
    expect(depthOf(reqWithDepth('1'))).toBe('1')
    expect(depthOf(reqWithDepth(undefined))).toBe('infinity')
    expect(depthOf(reqWithDepth('bogus'))).toBe('infinity')
  })

  it('classifies REPORT bodies', () => {
    expect(reportKind('<c:calendar-multiget xmlns:c="...">')).toBe('calendar-multiget')
    expect(reportKind('<c:calendar-query xmlns:c="...">')).toBe('calendar-query')
    expect(reportKind('<d:sync-collection/>')).toBe('unknown')
  })

  it('extracts hrefs regardless of namespace prefix', () => {
    const body = `
      <d:calendar-multiget xmlns:d="DAV:">
        <d:href>/caldav/calendars/household/a.ics</d:href>
        <href>/caldav/calendars/household/b.ics</href>
      </d:calendar-multiget>`
    expect(extractHrefs(body)).toEqual([
      '/caldav/calendars/household/a.ics',
      '/caldav/calendars/household/b.ics',
    ])
  })

  it('builds a multistatus with an OK propstat', () => {
    const xml = multistatus([okResponse('/caldav/x.ics', '        <d:getetag>"abc"</d:getetag>')])
    expect(xml).toContain('<d:multistatus')
    expect(xml).toContain('<d:href>/caldav/x.ics</d:href>')
    expect(xml).toContain('<d:status>HTTP/1.1 200 OK</d:status>')
    expect(xml).toContain('<d:getetag>"abc"</d:getetag>')
  })
})
