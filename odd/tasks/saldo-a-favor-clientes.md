# Cuenta corriente: saldo a favor de clientes

## Objetivo (pedido del usuario, 2026-10-02)
Los clientes pueden tener saldo a favor. Hoy el sistema lo muestra ("Saldo a favor") pero no hay forma de generarlo.

## Decisiones (usuario)
- Se genera de AMBAS formas: (1) una cobranza que excede la deuda deja el excedente a favor; (2) botón/formulario
  aparte "Cargar saldo a favor" (anticipo).

## Decisiones de diseño (defaults míos, sin confirmar)
- Saldo = cargos - cobranzas (ledger). Saldo negativo = a favor. Un cargo nuevo (venta a cuenta corriente) se
  compensa solo contra el saldo a favor: sin lógica de consumo extra.
- Un anticipo = movimiento PAYMENT (mismo tipo, mismos métodos; EFECTIVO exige caja abierta). Sin tipo nuevo.
- Se elimina el tope "monto <= saldo" en cobranza (PAYMENT_EXCEEDS_BALANCE) y la invariante saldo >= 0
  (MOVEMENT_BALANCE_NEGATIVE) en edit/delete de movimientos. Siguen: caja cerrada y venta = inmutables.
- UI: aviso "$X quedarán como saldo a favor" cuando el monto excede la deuda; "Cargar saldo a favor" siempre visible.
- Verificar que listado de saldos de Clientes, PDF y POS (venta a cuenta corriente) traten bien saldo negativo.

## Contexto de checks
- TDD estricto. Back jest (`api/`, `npx jest <archivo>`), front vitest (`pullstok-front/`). Ojo: el cliente Prisma
  multi-tenant prohíbe update/delete/findUnique singulares (usar findFirst/updateMany/deleteMany).
- Baseline: front 8 fallos (priceKgUpdate, productDrawer); api tsc con errores preexistentes (uiMode, e2e).

## Tareas
- [x] T1 — API: permitir sobrepago/anticipo y saldos negativos en cobranza y edit/delete + tests. Ruta: delegada.
      Evidencia: RED (6 failed/62 passed) -> GREEN (81 passed). tsc sin errores nuevos. Re-corrida mía: 4 suites / 81 passed.
      Revisado sin cambios: getBalances, PDF (ya rotula "Saldo a favor"), salesService (sin chequeo de saldo). Commit: 4bd69fb
- [x] T2 — Front: cobranza con excedente + "Cargar saldo a favor" + avisos; revisar saldos negativos en Clientes/POS/PDF.
      Ruta: delegada (mismo writer).
      Evidencia: RED (9 failed/44 passed) -> GREEN. Full vitest solo 8 fallos baseline. tsc/eslint limpios.
      Re-corrida mía: 3 suites / 63 passed. Commit: 6bb5aa0. Clientes ya mostraba "A favor $X"; POS no muestra saldos.
      Sin e2e (solo VPS).

## Progreso
Rama `feat/customer-credit-balance` desde main (bbec691). Independiente de `feat/sales-reprint-ticket` (sin mergear).

## Próximo paso
T1.
