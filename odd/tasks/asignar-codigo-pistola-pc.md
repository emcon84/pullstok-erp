# asignar-codigo-pistola-pc

**Objective:** On PC, when the barcode gun scans an unknown code, offer "Vincular código" (search product by name -> PUT barcode), like mobile StockScannerPage.
**Why:** Dashboard (admin list) and UnifiedPos (POS) only toast "Producto no encontrado" on 404.
**Scope:** new `AssignBarcodeDialog` molecule + wire into `views/Dashboard.tsx` and `views/UnifiedPos.tsx` 404 branch.
**TDD:** strict (project config); runner: vitest in `pullstok-front`.
**Delivery:** ask-on-risk; forecast < 400 lines.

## Tasks
- [x] T1 AssignBarcodeDialog (RED test -> GREEN) — route: delegated writer (2+ files)
- [x] T2 Wire Dashboard + UnifiedPos on 404 — route: same writer
- [x] T3 Run full front vitest + tsc; commit (conventional)

## Evidence
New tests 22/22 green (re-run by parent); full suite 1698/1706, 8 failures in priceKgUpdate.test.tsx (6) and productDrawer.test.tsx (2), reported by writer as failing identically without this change (not independently re-verified); tsc clean.
Commit: 683771f on feat/assign-barcode-pc-scan.
