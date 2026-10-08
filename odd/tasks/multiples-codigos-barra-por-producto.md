# Multiple barcodes per product

## Objective
A product can have several barcodes (e.g. same harness size from different brands). Any of them resolves the product when scanned/searched. `Product.barcode` stays as the primary code.

## Design
- New tenant model `ProductBarcode` (id, organizationId, productId, code, createdAt), `@@unique([organizationId, code])`, index on productId.
- A code must be unique across `Product.barcode` and `ProductBarcode.code` within the org (409 otherwise).
- Lookup (`by-code`, `by-scan`), text search and offline snapshot also consider aliases.
- Front: offline catalog indexes aliases; assign flow adds an additional code when the product already has one.

## Constraints
- No local DB: migration SQL written by hand, applied on the VPS (`prisma migrate deploy`). Backend unit tests run local (Jest), e2e only on VPS. Front: vitest.
- Strict TDD: RED, GREEN, REFACTOR per task. Runner: api `pnpm test`, front `pnpm test` (vitest run).
- Authored changed lines heuristic ~400 per task (advisory only).

## Tasks
- [x] T1 Schema + migration + tenant registration — commit 1fde9bf
- [x] T2 Backend: alias endpoints + cross-uniqueness (POST/DELETE `/products/:id/barcodes`) — commit 0c5a33c
- [x] T3 Backend: by-code / by-scan / search where / offline snapshot include aliases — commit 08dbd4a
- [x] T4 Front: offline catalog index + product search filter include aliases — commit aea8109
- [x] T5 Front: assign flow adds additional code; scanner card shows aliases; service fns — commit 1b39636 (not-found panel in StockScannerPage still replace-only; no alias delete UI)

## Route declaration
Delegated direct: one writer per task group (backend T1-T3, front T4-T5); trigger = writer rule (2+ non-trivial files).

## Progress / evidence
Mapping done (subagent). Branch: `feat/multiple-barcodes-per-product`.
Backend T1-T3 verified: `pnpm test` on alias/barcodes/config suites: 9 suites, 69 tests passed. Full api suite shows 20 failing suites (e2e need DB; schemas.test business-hours, untouched by this change; botService passes alone). Migration deploys via GitHub Actions (deploy.sh runs `prisma migrate deploy`).

## Next step
Merged to main and pushed; pipeline applies migration 20261008120000_product_barcodes. Front: 8 failures (priceKgUpdate, productDrawer) also fail on main baseline.
