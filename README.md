# Bill Splitter

Scan a restaurant receipt, tap who had what, and see exactly what each person owes.

> Status: early development. Receipts can be scanned or entered by hand and split
> on the device; sharing via QR comes next. See the [roadmap](docs/ROADMAP.md).

## Features (planned)

- **Receipt scanning**: take a photo and get every line item and its price.
- **Flexible assignment**: an item can belong to one diner, be shared by a few
  (with custom weights) or be split among everyone at the table.
- **Tips and discounts**: split proportionally to consumption or evenly.
- **Cent-perfect totals**: every split adds up to the receipt total, always.
- **Share via QR**: everyone at the table can follow the split from their phone.
- **Live collaboration** (later): several people assigning items at the same time.

## Repository layout

```
apps/
  web/        Vue 3 + Vite + TypeScript + Tailwind CSS front end
  api/        Node + Express API (receipt parsing, shared bills)
packages/
  core/       Framework-agnostic domain model and split engine
```

All money logic lives in `packages/core` and is shared by the web app and the
API, so both always agree on the numbers.

## Getting started

Requirements: Node.js 22.12 or later and pnpm 10 (`corepack enable` installs the
version pinned in `package.json`).

```bash
pnpm install
pnpm dev          # web on http://localhost:5173, API on http://localhost:3000
```

Without configuration the API uses a fake receipt reader that always returns
the same sample receipt, so the whole app works offline. To read real receipts,
copy `apps/api/.env.example` to `apps/api/.env` and set `ANTHROPIC_API_KEY`.

| Command                                     | What it does                               |
| ------------------------------------------- | ------------------------------------------ |
| `pnpm dev`                                  | Runs the web app and the API in watch mode |
| `pnpm test`                                 | Runs every package's unit tests            |
| `pnpm --filter @bill-splitter/web test:e2e` | Runs the browser tests (Playwright)        |
| `pnpm typecheck`                            | Type-checks every package                  |
| `pnpm lint`                                 | Lints the whole repository                 |
| `pnpm format`                               | Formats the whole repository with Prettier |
| `pnpm check`                                | Everything CI runs, except the build       |
| `pnpm build`                                | Builds the web app and the API             |

## How receipts are read

The web app downscales the photo to 1600 px and sends it to
`POST /api/receipts/parse`. The API asks Claude Haiku 5.5 to transcribe the
receipt into a fixed JSON shape (structured outputs), with amounts copied as
printed and parsed into cents on our side. If the lines do not add up to the
printed total, some lines are uncertain, or the model declines, the API retries
with Claude Sonnet 5.5 and keeps the more trustworthy result. Uncertain lines
are highlighted for a person to check. Photos are never stored.

`pnpm --filter @bill-splitter/api eval:receipts` measures accuracy on a private
set of real receipts (see `apps/api/eval/README.md`).

## How the split works

Amounts are stored as integer cents. Whenever an amount has to be divided, the
engine uses the largest remainder method: 10.00 split three ways becomes
3.34 + 3.33 + 3.33, never 3.33 × 3. Items whose diner was removed, and items
nobody has claimed yet, are reported as _unassigned_ instead of being lost, so
the diners' totals plus the unassigned total always equal the bill total.
