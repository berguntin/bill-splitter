---
name: verify
description: Run the same checks as CI (format, lint, types, core coverage, app tests, build, e2e) and scan the diff for this project's risks. Use before saying a change is done. Reports only; never fixes anything.
allowed-tools: Read, Grep, Glob, Bash(pnpm format:check), Bash(pnpm lint), Bash(pnpm typecheck), Bash(pnpm build), Bash(pnpm --filter *), Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git merge-base *), Bash(git rev-parse *)
---

# verify

Run the checks that `.github/workflows/ci.yml` runs, scan the diff for the
risks listed in `AGENTS.md`, and report. **Do not fix anything, do not edit
files, do not commit.** Answer in Spanish.

## 1. Work out the diff

```bash
git status --porcelain
git diff --stat origin/main...HEAD
git diff --stat HEAD
```

The change under review is `origin/main...HEAD` plus uncommitted changes
(`git diff HEAD`) plus untracked files. Classify the changed paths:

- `docs_only`: only `*.md`, `docs/**` or `.claude/**`.
- `core`: `packages/core/**`.
- `api`: `apps/api/**`.
- `web`: `apps/web/**`.
- `mongo`: `apps/api/src/**/mongo.ts`, `apps/api/src/bills/store.ts`,
  `apps/api/src/reports/store.ts`, `apps/api/src/db/**` or the contract tests.
- `deps`: `package.json` files or `pnpm-lock.yaml`.

Mention untracked files that are not part of the change: Prettier and ESLint
also read them, so they can make checks fail locally while CI passes.

## 2. Run the CI checks

Run them in this order and **do not stop at the first failure**: record each
result and keep going. Capture the relevant error lines (file:line and message),
not the whole log.

| #   | Check                 | Command                                           | When to skip                                                                         |
| --- | --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Format                | `pnpm format:check`                               | never                                                                                |
| 2   | Lint                  | `pnpm lint`                                       | never                                                                                |
| 3   | Types                 | `pnpm typecheck`                                  | never                                                                                |
| 4   | Core tests + coverage | `pnpm --filter @bill-splitter/core test:coverage` | never (it is fast)                                                                   |
| 5   | App tests             | `pnpm --filter "./apps/*" test`                   | never                                                                                |
| 6   | Build                 | `pnpm build`                                      | `docs_only`                                                                          |
| 7   | E2E                   | `pnpm --filter @bill-splitter/web test:e2e`       | when nothing under `apps/web`, `apps/api/src`, `packages/core/src` or `deps` changed |

Notes:

- Step 5 runs the MongoDB contract tests only if `TEST_MONGODB_URI` is set;
  otherwise they are skipped (the output says "2 skipped"). If `mongo` paths
  changed and the variable is not set, mark that part as ⏭️ "not verified:
  needs `TEST_MONGODB_URI`" and say CI will run it against MongoDB 7.0.
- Step 7 starts the API on port 3000 and a preview on 4173; if a port is
  busy or Chromium is missing, report it as ❌ with the exact error and the
  fix (`pnpm --filter @bill-splitter/web exec playwright install chromium`),
  don't retry in a loop.
- Never run `eval:receipts`: it calls the paid Claude API. If the diff touches
  `apps/api/src/receipts/prompt.ts`, `schema.ts`, `claude.ts` or the model
  constants in `parser.ts`, list "run `eval:receipts`" as a pending manual step.

## 3. Scan the diff

Read the full diff (`git diff origin/main...HEAD` and `git diff HEAD`, plus
untracked files) and look only at added or changed lines:

- `any` (`: any`, `as any`, `<any>`), `@ts-ignore`, `@ts-expect-error`,
  `eslint-disable`.
- Money: float literals or `/`, `Math.round`, `toFixed`, `parseFloat`,
  `Number(...)` applied to amounts outside `allocate()`, `parseMoney` or
  `formatMoney`.
- `packages/core`: any import that is not relative, or use of `fetch`,
  `localStorage`, `window`, `document`, `process`, Vue or Express.
- Secrets: API keys (`sk-ant-`, `ghp_`, `github_pat_`, `gho_`), tokens,
  passwords, connection strings with credentials (`mongodb+srv://user:pass@`),
  real DSNs; changes to `.env` files.
- Personal data in logs or Sentry: `req.log.*`, `logger.*` or
  `captureException` calls that include a bill, diner names, items, amounts,
  emails, report descriptions, images, request bodies, headers or tokens;
  any change to `PRIVATE_DATA_COLLECTION` or the logger `redact` list.
- New `process.env` reads outside `apps/api/src/config.ts`; new `VITE_*`
  variables not declared in `apps/web/src/env.d.ts`; new API variables
  missing from `apps/api/.env.example`.
- Persisted shapes: changes to `BillDocument`/`ReportDocument`, `Bill` types,
  `BillInputSchema`, or a `*_STORAGE_KEY` without a fallback for old data.
- UI: hard-coded user-visible text in `.vue` templates or `aria-label`s, keys
  added to `locales/en.ts` but not `es.ts`, raw colors (`#hex`, `rgb(`,
  Tailwind palette classes like `bg-red-500`) outside `assets/main.css` and
  `lib/palette.ts`.
- Tests: `.only(`, `.skip(` added, `console.log`, `debugger`; a `fix:` with no
  test change.
- New endpoints without a rate limit or without a `docs/API.md` update.

Known debt listed under "Known current state" in `AGENTS.md` is not a new
finding unless the diff adds to it.

## 4. Report

Reply in Spanish with one table, then the details:

| Comprobación      | Resultado    | Detalle                             |
| ----------------- | ------------ | ----------------------------------- |
| Formato           | ✅ / ❌ / ⏭️ | errors or the reason it was skipped |
| ...               |              |                                     |
| Revisión del diff | ✅ / ❌      | number of findings                  |

- ✅ passed, ❌ failed, ⏭️ skipped (always say why).
- After the table: for each ❌, the relevant errors with `file:line`; then the
  diff findings with `file:line` and why they matter; then pending manual
  steps (e2e not run, MongoDB contracts not run, `eval:receipts`).
- End with one line: whether the change is ready by CI standards, or what is
  missing. Do not propose or apply fixes beyond naming them.
