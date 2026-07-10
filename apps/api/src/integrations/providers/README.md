# Integration providers

Pull data from a self-hosted service onto Hame's dashboard and calendar, behind
one interface. This is the seam behind **Settings → Integrations**: a provider is
one module registered here, the same "drop in a module" model as a
[bin-scraper council](../../../../../packages/bin-scraper/README.md).

An **integration** is a configured instance of a provider (a row in the
`Integration` table). A provider owns its transport and returns **normalised**
data; the framework handles config, the encrypted secret, the poll schedule,
caching, and rendering — so a new provider needs no bespoke UI or storage.

## The two kinds

A provider declares one output `kind`:

- **`STATUS`** — a point-in-time metric snapshot (`{ label, value, state }[]`),
  rendered by the generic **System status** dashboard widget. `state` is one of
  `ok | warn | crit | unknown` and colours the value.
- **`CALENDAR`** — dated events, cached as `IntegrationEvent` rows and merged into
  the aggregated calendar alongside every other source.

The `feed` (ordered-list) kind is deferred and the write-shaped `action`/control
kind is a non-goal — see the spec §12.

## Adding a provider

1. Create `providers/<id>.ts` exporting a provider object typed as
   `StatusIntegrationProvider` or `CalendarIntegrationProvider` (see
   [`index.ts`](./index.ts)). Give it an `id`, `name`, `description`, and the
   `configFields` / `secretFields` it needs — those field specs drive the generic
   add/edit form, so **no UI changes are required**. (The framework stores a single
   secret, so declare at most one `secretField`.)
2. Implement `test(ctx)` (throw on failure) and the kind's fetch method —
   `fetchSnapshot(ctx)` for `STATUS`, `fetchEvents(ctx, horizon)` for `CALENDAR`.
   `ctx` carries the decrypted `config` and `secret`.
3. Keep the mapping **pure** (raw response → normalised data) and unit-test it
   against a saved fixture, so a provider's API changing shape is caught by a
   failing test — the same ethos as the bin-scraper's fixture parsers. The
   transport wrapper (the actual fetch/socket) is the thin part around it.
4. Register it in `registerBuiltInIntegrationProviders()` in
   [`index.ts`](./index.ts).

That's it — CRUD, the encrypted secret, the poller, the calendar/dashboard
surfaces, and backup all work automatically.

## Notes

- **LAN-exempt fetch.** Providers are admin-configured and point at your own LAN
  services, so use plain `fetch` / `ws` — **not** `safeFetch`. The SSRF guard's
  private-IP block is for arbitrary _user_ URLs (recipe import, iCal feeds); it
  would wrongly refuse a homelab host (spec §8.6).
- **Secrets.** Anything in `secretFields` is AES-256-GCM encrypted at rest and
  never returned to the client. It round-trips through backup/restore
  automatically because `Integration.secret` is in `BACKUP_SECRET_FIELDS`.
- **Graceful degradation.** Throw from `fetch*` on any failure; the service keeps
  the last good snapshot/events and records `lastError` — it never wipes cached
  data on a transient outage (spec §9.6).

## Built-in providers

- **`gitea`** — Gitea / Forgejo repository milestones (`CALENDAR`, HTTP + token).
- **`truenas`** — TrueNAS Scale pool/system status (`STATUS`, JSON-RPC over
  WebSocket + service-account API key).
