# API

Base path: `/api`. All bodies are JSON unless noted. Errors look like
`{ "error": "<code>" }`; unexpected ones (5xx) also carry the `requestId`.

Every response has an `X-Request-Id` header. Clients may send their own
(6 to 64 letters, digits or dashes) and the API reuses it, so both sides log the
same id. The web app shows it next to errors as a reference to quote.

## Health

### `GET /api/health`

`200 { "status": "ok" }` when the API can reach its database,
`503 { "status": "unavailable", "database": "unreachable" }` otherwise.

## Receipts

### `POST /api/receipts/parse`

Body: the photo itself, with `Content-Type: image/jpeg`, `image/png` or
`image/webp` (max 6 MB). The image is never stored.

- `200` `{ receipt, issues, model }`: `receipt.lines[]` with `name`, `quantity`,
  `total` (cents) and `confidence` (`high` | `low`); `receipt.total` in cents or
  `null`; `issues` lists why the scan should be checked (`total_mismatch`,
  `low_confidence`, `missing_total`, `no_lines`).
- `422` `not_a_receipt` | `unreadable` · `413` · `415` · `429` · `502`

## Shared bills

Anyone with a bill's id can read it; only the holder of its owner token can
change it. Bills expire `BILL_TTL_DAYS` (default 7) after their last update.

### `POST /api/bills`

Creates a shared bill. This is also the integration point for other apps (for
example Camarero Digital handing over a table's order): only item names and
totals are required.

```json
{
  "bill": {
    "currency": "EUR",
    "source": "import",
    "merchant": "Camarero Digital · Table 4",
    "items": [
      { "name": "Patatas bravas", "total": 650 },
      { "name": "Caña", "quantity": 2, "total": 480 }
    ]
  }
}
```

Amounts are integer cents. Optional fields: `diners[]` (`id`, `name`, `color`),
item `id`, `quantity` (default 1), `unitPrice`, `assignment` (default
`{ "mode": "unassigned" }`), `adjustments[]`, `receiptTotal`, and `groups[]`
(`{ id, dinerIds }`, two or more diners who pay together; ids of unknown diners
are dropped).

- `201` `{ id, ownerToken, bill, version, updatedAt, expiresAt }`. Keep
  `ownerToken` secret; the people at the table open `/b/<id>` in the web app.
- `400` `invalid_bill` (with `issues`) · `429`

### `PUT /api/bills/:id`

Replaces the bill. Header `Authorization: Bearer <ownerToken>`; same body as
`POST`. Extends the expiry.

- `200` `{ id, bill, version, updatedAt, expiresAt }` · `400` · `401` · `403` · `404`

### `PUT /api/bills/:id/groups`

Says who pays together. Anyone with the link may call it: it changes nothing
but the groups. Body `{ "groups": [{ "id": "g1", "dinerIds": ["ana", "ben"] }] }`
(a diner in one group at most). Answers like `GET`, with the new version.
`PUT /api/bills/:id` keeps the stored groups, so an owner's copy that is behind
never undoes them; the owner's app sends its own group changes here too.

- `200` · `400` `invalid_groups` · `404` · `429`

### `GET /api/bills/:id`

Public, read-only. Responses carry an `ETag`; send it back in `If-None-Match`
to get a bodiless `304` while nothing changed (the web app polls every 5 s).

- `200` `{ id, bill, version, updatedAt, expiresAt }` · `304` · `404`

### `GET /api/bills/:id/events`

Server-sent events (`text/event-stream`) for open pages: a `version` event with
`{ "version": n }` on connect and after every change (owner update or groups),
plus a comment line every 25 s to keep proxies from closing the connection.
Clients refetch the bill with its ETag on each event and keep polling as a
fallback (every 30 s while connected, 5 s otherwise). `404` for unknown bills,
`503` `too_many_streams` past 50 streams per bill or 2000 in total.

Events are delivered within one API instance; running several would need a
shared channel such as MongoDB change streams.

## Bug reports

### `POST /api/reports`

Sent by the "Report a problem" screen. Body:

```json
{
  "description": "The total is wrong after adding a tip",
  "email": "optional@example.com",
  "topic": "scan | split | share | other",
  "context": {
    "release": "<commit>",
    "route": "/bill/summary",
    "screen": "summary",
    "userAgent": "...",
    "language": "es-ES",
    "timeZone": "Europe/Madrid",
    "viewport": { "width": 390, "height": 844, "pixelRatio": 3 },
    "online": true,
    "errorRef": "7F3K92QD",
    "sentryEventId": "...",
    "recentRequests": [],
    "recentErrors": [],
    "navigation": [],
    "lastScan": {}
  },
  "bill": {},
  "attachments": [{ "kind": "receipt | screenshot", "mediaType": "image/jpeg", "data": "<base64>" }]
}
```

`bill` is an anonymized copy (names replaced). At most two attachments of
2 MB each. Answers `201 { "id": "<reference>" }`, `400 invalid_report`,
`413 payload_too_large` or `429 rate_limited` (10 reports per hour per IP).
Reports are kept for `REPORT_TTL_DAYS` (90) and, with `GITHUB_TOKEN`, open a
GitHub issue, or add a comment to the open issue for the same failure.

### `GET /api/reports/:id/attachments/:index?token=<token>`

Serves an attached photo. The token is only in the links of the GitHub issue.
