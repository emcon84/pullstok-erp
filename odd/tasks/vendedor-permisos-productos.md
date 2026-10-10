# Feature: vendedor-permisos-productos

## Objective
Let VENDEDOR users (almacen workflow: they sell, charge, control stock) do what ADMIN/MANAGEMENT can do around sales deletion and everything product-related.

## Scope (authorized by user)
VENDEDOR gets: delete sales; adjust loose stock (+ sidebar item); delete products, edit presentations, bulk-publish; manual products page (+ sidebar item).
Stays ADMIN-only: bulk price update, price-list import (PDF), bulk-carried, branches, settings.
Orders/quotes delete, product create/edit, branch stock edit: already allowed (no change).

## Constraints
- Branch: feat/vendedor-permisos. Strict TDD (RED -> GREEN). Runner: vitest (front, local), api unit tests local without DB (e2e only on VPS).
- Never push to main without user ask. Conventional commits, no AI attribution.
- Keep VENDEDOR branch-scoped stock rule (canEditBranchStock) unchanged.

## Tasks
- [x] T1 Backend: add VENDEDOR to requireRole on DELETE /sales/:id, loose-stock PUT /:lineId, DELETE /products/:id, presentations routes, bulk-publish, manual list/delete/promote. Tests first.
- [x] T2 Frontend: Sales.tsx canDeleteSale, navItems (stock suelto, productos manuales), ManualProducts.tsx guard, any presentation/delete product UI gates. Tests first.
- [x] T3 Verify: run api unit + front vitest suites, tsc.

## Route
T1+T2: delegated direct (one writer, 2+ non-trivial files).

## Progress / evidence
- T1 commit be3b1e4: RED 10 failed in api/tests/routes/vendedorPermissions.test.ts -> GREEN 43/43 routes tests. Service inline role checks (salesService ~117/152) only apply to createSale; deleteSale has none.
- T2 commit 750216b: RED 7 failed (nav, rolePermissions, canDeleteSaleRole) -> GREEN. Added canDeleteSaleRole, VENDEDOR in navItems/vendorSimpleNav (module-filtered) and ROLE_VISIBLE_PATHS /carga-manual. No role gates exist in product delete/presentations UI.
- T3: api tsc and front tsc: only pre-existing errors (stale Prisma client, e2e files) / front clean; pre-existing failures: api providerRoutes suite, front priceKgUpdate + productDrawer (fail on base too). e2e skipped (VPS only).
- Stays ADMIN-only (asserted by tests): bulk-price-update, bulk-carried, import-price-list(+apply), seco-barcodes-report.
