# AGENTS.md

Rules for coding agents working in this repository. They are instructions, not
documentation: the [README](README.md) explains the product, architecture and
deployment, and [docs/API.md](docs/API.md) the HTTP API. Read those for detail.

## Project

Bill Splitter: scan a restaurant receipt (or type it in), assign items to
diners, add tips and discounts, and share the split with the table through a QR
code. A pnpm monorepo with a Vue web app, an Express API and a framework-free
domain package.

## Stack

- Node.js `>=22.12.0` (`.nvmrc`: `22`), pnpm `10.28.0` (pinned in
  `packageManager`; use `corepack enable`). Never use npm or yarn, and never
  commit another lockfile than `pnpm-lock.yaml`.
- TypeScript `~6.0` everywhere, strict (`tsconfig.base.json`: `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`).
- `apps/web`: Vue 3, Pinia, vue-router, vue-i18n, Vite, Tailwind CSS 4,
  `@sentry/vue`. Unit tests with Vitest (jsdom), browser tests with Playwright.
- `apps/api`: Express 5, zod 4, MongoDB driver, pino, `@anthropic-ai/sdk`,
  `@sentry/node`, bundled with tsup. Tests with Vitest and supertest.
- `packages/core`: plain TypeScript, no runtime dependencies. Tests with Vitest.
- Deployed on Railway as two services (`SERVICE=web` / `SERVICE=api`) through
  the root `build` and `start` scripts (`scripts/*.mjs`).

## Commands

| Command                                           | Use                                                   |
| ------------------------------------------------- | ----------------------------------------------------- |
| `pnpm install`                                    | Install (CI uses `--frozen-lockfile`)                 |
| `pnpm dev`                                        | Web on :5173 and API on :3000 in watch mode           |
| `pnpm check`                                      | `format:check` + `lint` + `typecheck` + `test`        |
| `pnpm format`                                     | Fix formatting (Prettier)                             |
| `pnpm --filter @bill-splitter/core test:coverage` | Core tests with coverage thresholds                   |
| `pnpm --filter @bill-splitter/web test:e2e`       | Playwright tests (builds the web app, starts the API) |
| `pnpm build`                                      | Builds every package (type-checks the web app too)    |
| `pnpm --filter @bill-splitter/api eval:receipts`  | Receipt accuracy eval; calls the paid Claude API      |

### What CI runs (`.github/workflows/ci.yml`)

A change is done only when all of this passes. Job `check`, with a MongoDB 7.0
service and `TEST_MONGODB_URI=mongodb://localhost:27017`:

1. `pnpm install --frozen-lockfile`
2. `pnpm format:check`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm --filter @bill-splitter/core test:coverage` (thresholds in
   `packages/core/vitest.config.ts`: lines 95, branches 90, functions 95,
   statements 95)
6. `pnpm --filter "./apps/*" test`
7. `pnpm build`

Job `e2e`: installs Chromium and runs `pnpm --filter @bill-splitter/web test:e2e`.

`pnpm check` does not cover steps 5 and 7 or the `e2e` job, and without
`TEST_MONGODB_URI` the MongoDB contract tests in
`apps/api/test/*.contract.test.ts` are skipped. To run them locally, point
`TEST_MONGODB_URI` at a disposable MongoDB.

## Architecture

```
packages/core   Domain model and every money calculation (no framework, no I/O)
apps/api        Express API: receipt parsing, shared bills, bug reports
apps/web        Local-first Vue SPA; the guest view lives at /b/:id
```

Dependency direction: `apps/*` → `@bill-splitter/core`. Never the reverse, and
the two apps never import each other.

### `packages/core`

- Owns the domain types (`src/types.ts`) and all money logic: `allocate`,
  `computeBreakdown`, assignments, groups, payments, receipt checks,
  `parseMoney`/`formatMoney`, `anonymizeBill`.
- No runtime dependencies, no framework imports, no I/O (`fetch`, storage,
  `Date.now()` hidden in logic, `process`). Files only import each other.
- Public API is `src/index.ts`. Apps import from `@bill-splitter/core` only,
  never deep paths.
- Every change keeps the coverage thresholds; add tests under `packages/core/test`.

### `apps/api`

- Composition root: `src/dependencies.ts` builds every service from config;
  `src/app.ts` (`createApp(config, dependencies)`) wires middleware and
  routers without binding a port; `src/index.ts` handles the process
  lifecycle (Sentry, shutdown).
- Ports and adapters. Each port is an interface with an in-memory
  implementation for development and tests and a real one:
  - `BillStore` (`src/bills/store.ts`): memory and `src/bills/mongo.ts`.
  - `ReportStore` (`src/reports/store.ts`): memory and `src/reports/mongo.ts`.
  - `ReceiptParser` / `Extractor` (`src/receipts/parser.ts`): Claude in
    `src/receipts/claude.ts`, fake in `src/receipts/fake.ts`.
  - `ReportNotifier` (`src/reports/github.ts`): GitHub issues or `noopNotifier`.
    Behavior a store must have goes into its contract test
    (`test/billStore.contract.test.ts`, `test/reportStore.contract.test.ts`),
    which runs against both implementations.
- Routers are factories (`createXRouter(...)`) that receive their ports.
  Validate every body with a zod schema and `safeParse`; answer errors as
  `{ "error": "<snake_case_code>" }`, and 5xx with the `requestId`. Keep the
  per-route rate limits (`express-rate-limit`) and give every new endpoint
  one. Keep `docs/API.md` in sync with any endpoint change.
- Configuration is read only in `src/config.ts` (`loadConfig`, a zod schema
  that fails fast). Nothing else reads `process.env`.
- Route tests build the app with `createApp(loadConfig({ NODE_ENV: 'test' }),
testDependencies(...))` from `test/helpers.ts`.

### `apps/web`

- Screens are `src/views/*View.vue`; they only orchestrate `core` and the
  stores. Reusable UI goes in `src/components`, framework-free helpers in
  `src/lib`, state in `src/stores` (Pinia setup stores), `@/` is `src/`.
- The bill being edited lives in `stores/bill.ts` (with undo); recent bills in
  `stores/history.ts`; sharing in `stores/share.ts`.
- HTTP goes only through `src/lib/api.ts` (and `lib/followSharedBill.ts` for
  server-sent events). `VITE_*` variables are read only in `src/lib`.
- `localStorage` is accessed only through `lib/storage.ts` (`loadJson` with a
  type guard, `saveJson`), under versioned keys `bill-splitter/<name>/vN`.

## Product rules

- Totals are cent-exact: diners' totals plus the unassigned total always equal
  the bill total. Unassigned or orphaned items are reported, never dropped.
- An item is assigned as `unassigned`, `single`, `shared` (weights),
  `everyone` (includes diners added later) or `units`.
- Tips, service and discounts split `proportional` (to consumption) or `equal`.
- Groups only change how totals are presented; each member's share is unchanged.
- The bill works fully offline and survives a reload. Sharing is opt-in.
- Guests cannot edit items or prices: they can only set groups and mark
  payments. The API recomputes what a diner owes when they mark a payment;
  it never trusts amounts from the client.
- Recent bills stay on the device and are never sent anywhere.
- UI languages: English (source) and Spanish.

## Risk areas

### Money and the split engine (`packages/core`)

- Money is always an integer number of cents (`Cents`). No floats for amounts.
- Splitting an amount between diners or parts goes only through `allocate()`
  (largest remainder; deterministic tie-break by position).
- Parse user or OCR amounts with `parseMoney`, display them with `formatMoney`.
- Validate with tests in `packages/core/test` that assert the invariant
  (parts sum to the total) including negative amounts (discounts), zero
  weights and odd remainders; keep coverage above the thresholds.

### Shared bills (`apps/api/src/bills`, `routes/bills.ts`, `stores/share.ts`)

- Anyone with the bill id can read it; only the owner token can `PUT` it.
  Only the SHA-256 hash of the token is stored; compare with `tokenMatches`
  (constant time). Bill ids match `BILL_ID_PATTERN` and come from
  `newBillId()`.
- Owner updates must not overwrite `groups` and `payments` (`SHARED_FIELDS`).
  Payments use optimistic concurrency (`expectedVersion`, retried up to
  `PAYMENT_ATTEMPTS`); every write bumps `version` and publishes an event.
- Bills expire `BILL_TTL_DAYS` after the last change (Mongo TTL index plus a
  read filter on `expiresAt`).
- Bill events are in process (`bills/events.ts`): don't assume a single
  instance elsewhere; clients fall back to ETag polling.
- The bill payload is a public contract (`BillInputSchema`, also used by
  external integrations): additive, optional changes only, documented in
  `docs/API.md`.
- Validate with `test/bills.route.test.ts`, `test/billStore.contract.test.ts`
  (memory and MongoDB), `test/billEvents.test.ts` and the e2e specs
  `share-bill`, `pay-together` and `mark-as-paid`.

### Persisted data

- MongoDB collections `bills` and `reports` have no migration tool: a change
  to a stored shape must read existing documents (and documents written by
  the previous release) correctly.
- `localStorage` data from older app versions must keep loading. Changing a
  stored shape means a new key version and a fallback reader for the old one
  (see `SHARE_STORAGE_KEY` and `LEGACY_SHARE_STORAGE_KEY` in `stores/share.ts`).
  Invalid data must be discarded by the type guard, never crash the app.
- Validate with store tests (`apps/web/src/stores/__tests__`) that load the
  old shape, and the contract tests for MongoDB.

### Receipt scanning with Claude (`apps/api/src/receipts`)

- Models are constants in `src/receipts/parser.ts` (`PRIMARY_MODEL`,
  `FALLBACK_MODEL`); the fallback runs only when the primary result has issues.
- The model answers in the fixed shape `ModelReceiptSchema` (structured
  outputs) with amounts as printed strings; `toScannedReceipt` parses them
  with `parseMoney` and distrusts every field. The model never does arithmetic.
- Every request costs money: keep the per-IP rate limit
  (`RECEIPT_RATE_LIMIT`) and the image size limit; never call the real API
  from tests (use `createFakeReceiptParser` or a fake `Extractor`).
- After changing the prompt, schema or models, run
  `pnpm --filter @bill-splitter/api eval:receipts` on the private receipt set
  (`apps/api/eval/README.md`) and report the before/after numbers. Unit tests
  go in `test/parser.test.ts` and `test/schema.test.ts`.

### Bug reports (`apps/api/src/reports`, `apps/web/src/views/ReportView.vue`)

- Reports may carry an email, a description, an anonymized bill
  (`anonymizeBill`) and photos. Attachments are served only with their access
  token; reports expire after `REPORT_TTL_DAYS`.
- User text sent to GitHub goes through the escaping in `reports/markdown.ts`
  (no mentions, issue links or broken tables).
- Validate with `test/reports.route.test.ts`, `test/reportMarkdown.test.ts`,
  `test/githubNotifier.test.ts` and the `report-problem` e2e spec.

## Privacy and security

- Bills hold people's names; receipts are photos. Receipt photos are never
  stored or logged.
- Never log bill contents, names, amounts, images, emails, report text, IP
  addresses, headers or tokens. Log shapes and counts (see `summarize` in
  `routes/bills.ts`). The logger redacts `authorization`, `cookie` and
  `*.ownerToken`, and the HTTP logger redacts `token=` in URLs.
- Sentry (web and API) runs with `PRIVATE_DATA_COLLECTION`: no bodies,
  headers, cookies, query params, local variables or AI inputs/outputs, and
  replays fully masked. Do not loosen it.
- Error responses never echo user input beyond zod field paths and messages.
- Secrets live only in the host's environment variables (Railway), never in
  the repo, logs or client bundles. `VITE_*` variables end up in the public
  bundle: never put a secret in one.

## Code rules

- English everywhere: code, identifiers, comments, commits, docs.
- No `any`; prefer `unknown` plus a type guard or zod. Use `import type` for
  types (`@typescript-eslint/consistent-type-imports`); prefix unused
  arguments with `_`.
- Formatting is Prettier (`.prettierrc.json`: single quotes, semicolons,
  trailing commas, width 100); 2-space indent, LF (`.editorconfig`).
- UI copy is never hard-coded: use vue-i18n (`t('screen.key')`) with the
  English text in `apps/web/src/locales/en.ts` and the Spanish one in `es.ts`
  (`es` is typed as `Messages`, so both need every key). Plurals use
  `singular | plural` and `t('key', { n }, n)`.
- Components use the semantic design tokens from `apps/web/src/assets/main.css`
  (`bg-surface`, `text-ink-muted`, `bg-accent`, ...), never raw colors; the
  tokens have light and dark values. Diner colors come from
  `lib/palette.ts` (fill/ink pairs chosen for contrast).
- Accessibility: interactive elements have an accessible name (translated
  `aria-label` when there is no visible text). E2E tests select by role and
  name, so keep them meaningful.
- Tests: domain logic in `packages/core/test`; API routes with supertest;
  web stores and `lib` with Vitest under `__tests__`; user flows with
  Playwright in `apps/web/e2e`. A bug fix comes with a test that fails without it.

## Workflow

- Every task starts from an up-to-date `main`: `git fetch origin`, then a
  new branch from `origin/main`. If `main` moves, merge it into your branch
  before opening or updating the pull request.
- Changes reach `main` only through a pull request; never commit or push to
  `main` directly. One branch per task, named `<type>/<short-kebab-name>`
  (for example `feat/recent-bills`, `fix/web-accessibility`).
- Commits follow Conventional Commits with an optional scope, as in the
  history: `feat(web): ...`, `fix: ...`, `ci: ...`, `chore: ...`, `docs: ...`.
- Run the CI checks above before saying a change is done.

## Files not to touch

- `.env` and `.env.*` (git-ignored; they hold real secrets). Never read
  secrets out of them or print them.
- `pnpm-lock.yaml` by hand: change it only through `pnpm`.
- `apps/api/eval/receipts/*`: private photos, git-ignored.
- `docs/screenshots/` unless the task is to refresh them.

New environment variable: add it to the zod schema in `apps/api/src/config.ts`
(with a safe default or a production check), to `apps/api/.env.example` with a
comment, and to the Railway table in the README. For the web, declare
`VITE_*` variables in `apps/web/src/env.d.ts` and read them in `src/lib`;
they are fixed at build time.

## Known current state

Debt where the code does not yet follow these rules. Don't assume it does, and
don't spread these patterns:

- `unitPrice` is derived with float division outside `allocate()`:
  `apps/web/src/stores/bill.ts` (`Math.round(total / quantity)`, three places)
  and `apps/api/src/bills/schema.ts` (`toBill`). The split uses `total` only,
  so it is display data.
- Editable amounts are turned into strings with `(cents / 100).toFixed(2)`
  in `apps/web/src/views/ItemsView.vue` and `SummaryView.vue` instead of a
  `core` helper.
- `adjustmentAmount` in `packages/core/src/split.ts` rounds a percentage of
  the items total with its own `roundHalfAwayFromZero`, not `allocate()`.
- Bill events are in process; several API instances would need a shared
  channel (README).
- CI runs MongoDB 7.0 instead of 8.x because of a kernel bug (comment in
  `ci.yml`); production may run a different version.
- `GET /api/reports/:id/attachments/:index` has no rate limit (it requires
  the access token); `GET /api/health` has none on purpose.
- The stored bill in `localStorage` is validated shallowly (`isBill` in
  `stores/bill.ts` checks only top-level fields).
