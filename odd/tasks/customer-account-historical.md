# Cuenta corriente: carga histórica + clientes sin campos obligatorios

## Objetivo
1. Poder cargar deuda histórica (ventas viejas) en la cuenta corriente de un cliente. El detalle es
   OPCIONAL: solo monto (+ fecha), con nota de texto libre si se tiene el detalle.
2. Crear un cliente sin ningún campo obligatorio (nombre, email, etc. todos opcionales).

## Decisiones (usuario, 2026-09-29)
- Detalle no obligatorio en la carga histórica: "si lo tenemos lo cargamos y si no no, solo monto con fecha".
- Ningún campo obligatorio al crear un cliente.

## Decisiones de diseño (defaults míos, sin confirmar)
- Cargo histórico = `CustomerAccountMovement` type CHARGE, `saleId` null, `amount > 0`, `createdAt` = fecha
  elegida (default hoy, no futura), `note` opcional (texto libre = el "detalle"). NO se crean `Sale` falsas
  (ensuciarían stock, caja y reportes). Sin detalle estructurado por ítems (fuera de alcance).
- Endpoint nuevo `POST /customers/:id/account/charges` (mismo tenant scope y auth que payments).
- Cliente: `Customer.name` y `Customer.email` pasan a opcionales (migración SQL a mano; el pipeline la aplica).
  `@@unique([organizationId, email])` se mantiene (varios NULL no chocan en Postgres). Los strings vacíos
  del front se normalizan a null para no chocar con el unique.
- Fallback de nombre "Sin nombre" en pantallas, PDF del extracto y saldos.
- Carga masiva CSV: fuera de alcance v1 (se ofrece después si hace falta).
- Ventas y `createdById` del cargo: si el ledger ya guarda `createdById`, se guarda igual.

## Contexto de checks
- TDD: estricto (config de sesión "Strict TDD Mode: enabled"). RED → GREEN → REFACTOR observados.
- Runners: backend jest (`api/`, `npx jest <archivo>`, unit sin DB), front vitest (`pullstok-front/`).
- e2e backend solo en el VPS. Migraciones a mano, no correr manual.
- Heurística: ~400 líneas autorales por tarea. Forecast total ~500. Entrega: commits en la rama
  `feat/customer-account-historical`, sin PR (misma práctica que cuenta-corriente); merge/push los decide el usuario.

## Tareas
- [x] T1 — API: Customer `name`/`email` opcionales (schema.prisma + migración a mano + Zod create/update +
      controller). Tests primero. Ruta: delegada (writer backend).
      Evidencia: RED (customerSchemas.test.ts 5 failed/2 passed; customerAccountService.test.ts 3 failed/22 passed)
      -> GREEN (32 passed). Full unit suite 115 suites / 1701 passed, 2 skipped. tsc: solo los 3 errores e2e conocidos.
      Cambios: schema.prisma, migración 20260929120000_customer_optional_fields, Zod (blank -> null),
      fallback "Sin nombre" (balances, getAccount, PDF/filename), mails con `cliente` si no hay nombre,
      checkout de tienda no envía mail sin email. Commit: 19ad7a4
- [x] T2 — API: `POST /customers/:id/account/charges` (cargo histórico: monto, fecha opcional, nota opcional)
      + tests; fallback "Sin nombre" en el extracto PDF/saldos. Ruta: delegada (mismo writer).
      Evidencia: RED (4 suites fallan: TS por API inexistente + PDF 1 failed) -> GREEN (68 passed en las 4 suites).
      Full unit suite 115 suites / 1714 passed, 2 skipped (una corrida previa mostró vendorChatService flaky bajo carga;
      pasa aislado y en re-corrida). tsc: solo los 3 errores e2e conocidos.
      Cambios: createAccountChargeSchema (fecha no futura, tolerancia 5 min), service.registerHistoricalCharge,
      controller + ruta POST /:id/account/charges, PDF: CHARGE sin venta = "Deuda anterior". Orden del extracto ya era createdAt desc.
      Commit: d85c32d
- [ ] T3 — Front: formulario de cliente sin campos obligatorios (`Customers.tsx`, `customerModel.ts`) +
      fallback "Sin nombre". Tests primero. Ruta: delegada (writer front).
- [ ] T4 — Front: "Cargar deuda anterior" en `CustomerAccountDialog` (monto, fecha, nota) + service/hook.
      Tests primero. Ruta: delegada (mismo writer front).

## Progreso
- Rama creada desde `main` (`afd9900`). Exploración hecha (customerController, Zod route, schema Prisma,
  cuenta corriente front/back).

## Próximo paso
Delegar T1–T2 al writer backend.
