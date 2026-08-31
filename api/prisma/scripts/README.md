# Runbook — Multi-pack por unidad (backfill / rollback)

Operational VPS data job for `sdd/venta-por-unidad-multpack`. **Never run locally**
(no local Postgres) — run on the VPS: `root@72.61.25.48`, `/var/www/pullstok`.

## Prereqs
- Prisma migration `20260831000000_multipack_units_per_box` applied (adds
  `products.unitsPerBox` + `SaleMode.POR_UNIDAD`). Apply order:
  1. Migration (record-only, safe, additive).
  2. Backfill (this doc) — converts box stock → units.
  3. Deploy new backend (POR_UNIDAD logic) + frontend batch 2.

## Backfill (`backfill-unitsPerBox.ts`)
Idempotent: only sets `unitsPerBox` for products where it is `null`, parses the
name with the "NxG" regex, and keeps only real multi-packs (`unitsPerBox > 1`).

```bash
cd /var/www/pullstok && pnpm --dir api exec ts-node api/prisma/scripts/backfill-unitsPerBox.ts --org <slug>
cd /var/www/pullstok && pnpm --dir api exec ts-node api/prisma/scripts/backfill-unitsPerBox.ts --org <slug> --apply
```

**Human gate (task 3.3):**
1. Run `--dry-run` → review the candidate list + parsed count + the box→unit
   stock impact. Confirm `unitsPerBox > 1` for every row (no false positives from
   single-weight names like "X 15 KG").
2. **Human confirms** the count is sane.
3. Run `--apply`.
4. Verify in the UI / e2e on the VPS.

What apply does, per product:
- `products.unitsPerBox = N`
- `ProductStock.quantity = ProductStock.quantity × N` (box → units)
- `Product.quantity = Product.quantity × N` (legacy HQ stock in units)

## Rollback (`rollback-unitsPerBox.ts`)
Reverses the backfill. Only touches products with `unitsPerBox > 1`.

```bash
cd /var/www/pullstok && pnpm --dir api exec ts-node api/prisma/scripts/rollback-unitsPerBox.ts --org <slug>
cd /var/www/pullstok && pnpm --dir api exec ts-node api/prisma/scripts/rollback-unitsPerBox.ts --org <slug> --apply
```

- `ProductStock.quantity = ProductStock.quantity ÷ N` (units → box)
- `Product.quantity = Product.quantity ÷ N`
- `unitsPerBox = null` (back to box-only)

## Verification notes
- The DB apply itself is **e2e-only on the VPS**; local `pnpm jest` covers the pure
  logic (`unitsForBoxes` / `boxesForUnits` / `deriveBackfillUnitsPerBox`) and the
  server-authoritative sale recompute.
- If a mis-parse slips through, roll back with the rollback script — do not reverse
  the Prisma `ALTER TYPE ADD VALUE` by hand (not drop-able in a Prisma migration).
