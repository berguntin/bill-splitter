# API

Base path: `/api`. All bodies are JSON unless noted. Errors look like
`{ "error": "<code>" }`.

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
`{ "mode": "unassigned" }`), `adjustments[]`, `receiptTotal`.

- `201` `{ id, ownerToken, bill, version, updatedAt, expiresAt }`. Keep
  `ownerToken` secret; the people at the table open `/b/<id>` in the web app.
- `400` `invalid_bill` (with `issues`) · `429`

### `PUT /api/bills/:id`

Replaces the bill. Header `Authorization: Bearer <ownerToken>`; same body as
`POST`. Extends the expiry.

- `200` `{ id, bill, version, updatedAt, expiresAt }` · `400` · `401` · `403` · `404`

### `GET /api/bills/:id`

Public, read-only. Responses carry an `ETag`; send it back in `If-None-Match`
to get a bodiless `304` while nothing changed (the web app polls every 5 s).

- `200` `{ id, bill, version, updatedAt, expiresAt }` · `304` · `404`
