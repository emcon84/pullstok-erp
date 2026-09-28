# Cuenta corriente de clientes (método de pago + cobranzas)

## Objetivo
En el POS, nuevo medio de pago **Cuenta corriente**: al elegirlo se selecciona el
cliente al que se le asigna la venta. El cliente acumula un saldo deudor y puede
saldarlo después con cobranzas. Módulo completo (decisión del usuario 2026-09-28).

## Decisiones confirmadas con el usuario
- Alcance completo: venta a cuenta corriente + libro de movimientos + cobranzas + saldo.
- Se trabaja directo en `main` (un solo dev); commits sí, push solo cuando el usuario lo pida.

## Decisiones de diseño (defaults míos, sin confirmar)
- Nuevo valor de enum `PaymentMethod.CUENTA_CORRIENTE`. Puede combinarse con otros
  medios en la misma venta (pago dividido): Σ payments == totalAmount se mantiene.
- Cliente OBLIGATORIO si hay una fila CUENTA_CORRIENTE con monto > 0 (`customerId` en
  `createSaleSchema`, validado contra la org; otra org → 404).
- Libro: modelo tenant `CustomerAccountMovement` (customerId, type CHARGE|PAYMENT, amount > 0,
  saleId?, method?, cashSessionId?, note?, createdById, createdAt). Saldo =
  Σ CHARGE − Σ PAYMENT (calculado por agregación, sin campo denormalizado).
- La venta a cuenta corriente crea el CHARGE en la MISMA transacción que la venta.
- CUENTA_CORRIENTE NO suma al arqueo (no es plata cobrada). Una cobranza en EFECTIVO SÍ suma
  al `expectedAmount` de la caja abierta (requiere `cashSessionId`); otros métodos no.
- Cobranza: métodos permitidos EFECTIVO/TARJETA_*/TRANSFERENCIA/QR (nunca CUENTA_CORRIENTE);
  monto > 0; se permite pagar de más? NO en v1 (monto ≤ saldo). Sin límite de crédito en v1.
- Sin recargo de tarjeta en cobranzas (v1).
- Roles: mismas reglas que ventas/clientes (todo usuario autenticado; sin gate nuevo).

## Hechos verificados (mapper, 2026-09-28)
- Venta: `salesRoutes.ts` → `salesController.createSale` → `SaleService.createSale`
  (`salesService.ts` L56-549; Σ pagos L475-493; recargo L495-511; persistencia pagos L526-536).
  Zod: `validation/schemas.ts` `paymentSchema` L327, `createSaleSchema` L338.
- Arqueo: `cashSessionService.closeCash` L149-157 filtra solo EFECTIVO.
- Clientes: `customerRoutes.ts`/`customerController.ts` (getCustomers = findMany sin búsqueda).
- Tenant: `config/db.ts` TENANT_MODELS L17-64 (usar findFirst/updateMany, nunca findUnique/update).
- Migraciones `api/prisma/migrations/YYYYMMDDHHMMSS_*` (última `20260926120000_sale_surcharge`);
  las aplica el pipeline — NO correr manual. Sin BD local: migración SQL escrita a mano.
- Front: cadena `VendorOrderPanel → PaymentModal.confirmSale → useVendorCheckout →
  useSales → saleServices`. `PaymentMethod` en `models/cashSessionModel.ts` (labels/arrays en
  PaymentModal, PaymentSection, CashSessionPage, saleTicket.ts, Statistics.tsx).
- Clientes front: `views/Customers.tsx`, `useCustomer.ts`, `customerService.ts`, ruta `/Clientes`.

## Contexto de checks
- TDD: estricto (config de sesión "Strict TDD Mode: enabled"). RED → GREEN → REFACTOR observados.
- Runners: backend jest (`api/`, unit sin DB, `npx jest <archivo>`), front vitest (`pullstok-front/`).
- e2e backend solo en el VPS (no se corren acá).
- Estimación: ~900 líneas autorales. Entrega: commits directos a `main` por tarea, sin PRs.

## Tareas
- [x] T1 (04d2a9f) — API: enum `CUENTA_CORRIENTE` + modelo `CustomerAccountMovement` (schema, migración SQL a
      mano, TENANT_MODELS). Ruta: delegada (writer backend).
- [x] T2 (c0b531f) — API: `createSale` acepta CUENTA_CORRIENTE + `customerId` (obligatorio), crea CHARGE en la
      transacción; arqueo lo excluye. Tests primero. Ruta: delegada (mismo writer).
      Evidencia: tests nuevos RED (6 fail en salesService.cuentaCorriente) → GREEN; `jest src/validation tests/controllers/salesController.test.ts tests/services` 34/34 suites. Extra: `deleteSale` borra el CHARGE de la venta (revierte la deuda).
- [x] T3 (b567b59) — API: `GET /customers/:id/account` (saldo + movimientos), `GET /customers/balances`,
      `POST /customers/:id/account/payments` (cobranza; EFECTIVO suma al arqueo). Tests primero.
      Ruta: delegada (mismo writer).
      Evidencia: 5 suites nuevas/tocadas RED (módulos inexistentes / 2 fail) → GREEN (83 tests); `jest --testPathIgnorePatterns tests/e2e` 111/111 suites, 1630 passed, 2 skipped; `tsc` solo 3 errores preexistentes en tests/e2e. Cobranza: lock `FOR UPDATE` del cliente + re-chequeo de saldo en la tx.
- [ ] T4 — Front: `CUENTA_CORRIENTE` en modelo/labels (typecheck exhaustivo), selector de cliente en
      `PaymentModal`, `customerId` en `confirmSale → useVendorCheckout → useSales → API`, ticket.
      Tests primero. Ruta: delegada (writer front).
- [ ] T5 — Front: vista de cuenta corriente en `/Clientes` (saldo, movimientos, registrar cobranza)
      + service/hook. Tests primero. Ruta: delegada (mismo writer front).

## Progreso
- Mapper corrido; `main` alineado con `origin/main` = producción (`20cf5e5`).

- Backend T1–T3 hecho (3 commits en `main`, sin push). Migración `20260928120000_customer_account` escrita a mano (la aplica el pipeline).

## Próximo paso
T4 → T5 (front) con un writer front. e2e backend pendientes de correr en el VPS.
