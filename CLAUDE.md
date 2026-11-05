@AGENTS.md

# Claude Code

Project rules live in `AGENTS.md` (imported above). This section only covers
what is specific to Claude Code.

- Before saying a change is done, run `/verify` (skill in
  `.claude/skills/verify`): it runs the CI checks and scans the diff.
- Before committing, run the `reviewer` subagent on the diff.
- Also run each specialized reviewer whose area the change touches:
  - `money-reviewer`: `packages/core`, or any code that computes, parses,
    formats or splits amounts.
  - `sharing-reviewer`: shared bills (`apps/api/src/bills`,
    `apps/api/src/routes/bills.ts`, `apps/web/src/stores/share.ts`,
    `apps/web/src/lib/followSharedBill.ts`, `GuestView.vue`).
  - `persistence-reviewer`: MongoDB stores or documents, or anything saved in
    `localStorage`.
  - `privacy-reviewer`: logging, Sentry, bug reports, anything that handles
    names, photos, emails or tokens.
  - `receipts-reviewer`: `apps/api/src/receipts`, the scan route or
    `apps/web/src/lib/compressImage.ts`.
  - `ui-reviewer`: `.vue` files, locales, `assets/main.css` or e2e specs.
- The web dev server is configured in `.claude/launch.json` (`web`, port 5173);
  it proxies `/api` to the API on port 3000, so start the API too
  (`pnpm dev` runs both).
