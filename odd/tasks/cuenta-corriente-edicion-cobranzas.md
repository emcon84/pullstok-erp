# Cuenta corriente: editar movimientos, cobranza parcial con detalle, drawer

## Objetivo (pedido del usuario, 2026-10-02)
1. Poder EDITAR las deudas anteriores cargadas a mano.
2. Visualizar la cuenta corriente en un DRAWER (no Dialog) para que la tabla no tenga scroll horizontal.
3. Cobranzas parciales con detalle (monto, fecha, método, nota), cargadas igual que la deuda anterior.

## Problema
Caso Alberico: se registró una cobranza de $287.650 (= saldo completo) por error. El form precarga el saldo
entero, no tiene fecha/detalle y no hay forma de corregir un movimiento (no existe edit/delete).

## Decisiones de diseño (defaults míos, sin confirmar)
- Editables: CHARGE sin `saleId` (deuda anterior) y PAYMENT. CHARGE con venta = inmutable.
- Edit/delete de movimiento: monto, fecha, nota (NO método en PAYMENT). Invariante: el saldo resultante nunca < 0.
- PAYMENT en EFECTIVO ligado a una caja CERRADA = no editable/borrable (alteraría un arqueo cerrado). Caja OPEN o
  otros métodos: permitido.
- Cobranza acepta `date` opcional (no futura, tolerancia 5 min, igual que el cargo histórico).
- Form de cobranza: colapsable como "Cargar deuda anterior", monto SIN precarga + atajo "Cobrar todo".
- Borrado = hard delete del movimiento (ledger sin auditoría extra en v1).
- Lock FOR UPDATE del cliente en edit/delete (igual que registerPayment).

## Contexto de checks
- TDD estricto. Runners: backend jest (`api/`, `npx jest <archivo>`, unit sin DB), front vitest (`pullstok-front/`).
- e2e backend solo en el VPS. Heurística ~400 líneas por tarea. Commits en esta rama, sin push/PR (los decide el usuario).

## Tareas
- [x] T1 — API: `date` opcional en cobranza + PATCH/DELETE `/customers/:id/account/movements/:movementId`
      con reglas de arriba. Tests primero. Ruta: delegada (writer backend).
      Evidencia: RED (3 suites TS fail) -> GREEN (11 suites / 372 tests; re-corrida mía: 3 suites / 69 passed).
      tsc: 12 errores, ninguno en archivos tocados (uiMode/Prisma client viejo + e2e preexistentes). Sin test de DB
      del FOR UPDATE (solo mocks): conviene e2e en VPS. Commit: 92b5d72
      Contrato: PATCH {amount?,date?,note?} -> {movement,balance}; DELETE -> {deletedId,balance}; errores
      MOVEMENT_NOT_FOUND 404, MOVEMENT_IMMUTABLE 422, CASH_SESSION_CLOSED 422, MOVEMENT_BALANCE_NEGATIVE 400.
- [ ] T2 — Front: service/hooks (update/delete movimiento, payment con date). Tests primero. Ruta: delegada (writer front).
- [ ] T3 — Front: `CustomerAccountDialog` → `CustomerAccountDrawer` (Sheet, sin scroll horizontal), form de cobranza
      parcial colapsable, editar/borrar movimientos. Tests primero. Ruta: delegada (mismo writer front).

- [ ] T4 — Resumen de cuenta lindo (pedido 2026-10-02): rediseñar `api/src/services/accountStatementPdf.ts`
      (pdfkit, hoy tabla pelada) con la identidad visual de `PrintInvoice` (front): membrete, caja de saldo
      destacada, tabla con zebra/colores (deuda rojo, cobranza verde), columna de saldo acumulado, paginado con
      pie. Front: botón "Imprimir / descargar PDF" en el drawer (reusa `statement-link`) junto a WhatsApp.
      Tests primero. Ruta: delegada (writer backend + front).

- T4a (PDF backend) hecho: commit 1f7d4cf. RED (5 failed/8 passed) -> GREEN (2 suites / 42 passed). Sample revisado
  visualmente (saldo acumulado, caja de saldo, notas con wrap, pie paginado). Falta T4b (botón front).

- [x] T2 (6d329f7), T3 (64ee7fb), T4b (6422630) hechos. RED->GREEN: T2 22/22, T3 42/42, T4b 46/46. Full vitest
      1413 passed / 8 failed (baseline priceKgUpdate+productDrawer). tsc app limpio. eslint: 2 `no-explicit-any`
      preexistentes en Customers.tsx. Re-corrida mía: 4 suites / 72 passed.
- [x] T1 y T4a: ver arriba. T4 completo.

## Progreso
Rama `feat/account-movements-edit-partial-payments` desde main (cb36ad3).

## Próximo paso
T1.
