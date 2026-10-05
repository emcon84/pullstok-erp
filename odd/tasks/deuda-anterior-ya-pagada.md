# deuda-anterior-ya-pagada

## Objective
When loading a "deuda anterior" for a customer (e.g. Almacén de las mascotas), allow marking it as already paid, so the purchase is recorded in the statement without leaving a balance.

## Design
- `createAccountChargeSchema` gains optional `alreadyPaid: boolean`.
- `registerHistoricalCharge`: when `alreadyPaid`, in one `$transaction` (customer locked FOR UPDATE) create the CHARGE and a PAYMENT of the same amount, same date, `method: null`, `cashSessionId: null`, same note. Balance unchanged; cash register untouched.
- Front: checkbox "Ya pagada" in the create form only (hidden when editing); sends `alreadyPaid: true`.
- Existing UI already renders a PAYMENT with null method as "—".

## Tasks
- [x] T1 API: schema + service + controller passthrough, with tests (TDD) — commit dce7194
- [x] T2 Front: service type + drawer checkbox, with tests (TDD) — commit df9692a

## Mode
Strict TDD (project config). Runners: api jest (local, no DB), front vitest.

## Progress / evidence
- T1 RED observed (TS errors: alreadyPaid unknown), GREEN: jest schemas+service+controller 93/93 passed. Controller needed no change (req.body passthrough).
- T2 RED: 3 failing drawer tests, GREEN: vitest drawer+service+hook 81/81 passed; tsc --noEmit clean (front).
- API tsc has pre-existing errors (stale generated Prisma client: uiMode, AccountType), none in touched files.
- Route: delegated writer (fork). Not pushed.
