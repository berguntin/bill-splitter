# Roadmap

## Phase 0: Foundations

- [x] pnpm monorepo with `apps/web`, `apps/api` and `packages/core`
- [x] Vue 3 + Vite + TypeScript + Tailwind CSS + Pinia + Vue Router
- [x] Express API skeleton with validated configuration and a health check
- [x] Split engine: integer cents, largest remainder allocation, weighted
      shares, "everyone" items, tips and discounts, receipt total check
- [x] Lint, format, type-check and test in CI
- [ ] Design system and screen mock-ups

## Phase 1: Local MVP (no backend)

- Create a bill by hand, add diners, assign items, see the summary
- Split multi-quantity lines into units
- Persist the current bill in `localStorage`
- Undo for every assignment action

## Phase 2: Receipt scanning

- Camera capture and client-side compression (long edge around 1600 px)
- `POST /api/receipts/parse`: a vision model returns line items as structured
  JSON. Claude Haiku 5.5 by default, retried on Claude Sonnet 5.5 when the
  result fails validation (items do not add up to the printed total, low
  confidence lines, or a refusal)
- Review screen: editable lines, highlighted low-confidence lines, a banner
  comparing the items' sum with the receipt total
- Evaluation set of 20 to 30 real receipts to measure accuracy
- Images are never stored

## Phase 3: Share via QR (read-only)

- `POST /api/bills`, `PUT /api/bills/:id` (owner token), `GET /api/bills/:id`
- Public read-only view at `/b/:id`, refreshed by polling
- Bills can be created from existing line items, so Camarero Digital can hand
  over a table's order without scanning
- Bills expire automatically (TTL)

## Phase 4: Polish and launch

- PWA, dark mode, accessibility review, i18n (English and Spanish)
- "Mark as paid" per diner, PayPal.me links, IBAN and Bizum number to copy
- Deploy on a subdomain of Camarero Digital

## Phase 5: Live collaboration

- Socket.IO rooms per bill, small versioned operations, server as the source
  of truth, optimistic updates on the client
- "Who are you?" picker, presence indicators

## Later

- Integrated payments (for example Stripe Checkout)
