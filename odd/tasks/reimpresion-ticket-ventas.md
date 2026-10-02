# Reimpresión de tickets desde la sección Ventas

## Objetivo (pedido del usuario, 2026-10-02)
Poder reimprimir el ticket de una venta ya cerrada desde la sección Ventas, en cualquier momento posterior.

## Decisiones de diseño (defaults míos, sin confirmar)
- Reusa el pipeline existente: `useTicketPrint` (agente local -> relay -> panel del navegador) y `saleTicket`.
- El ticket se arma desde la `Sale` guardada (items, total, medios de pago, cliente, fecha original de la venta).
  Se marca como reimpresión (leyenda "REIMPRESIÓN" en el ticket) para no confundirlo con el original.
- Botón en la lista de ventas y/o en el drawer de la venta; el writer elige donde encaja mejor con la UI actual.
- Sin cambios de backend salvo que falte algún dato en la venta (si falta, el writer lo reporta).

## Contexto de checks
- TDD estricto. Front vitest (`pullstok-front/`, `npx vitest run <archivo>`). Baseline conocido: 8 fallos
  (priceKgUpdate, productDrawer). Commits en la rama `feat/sales-reprint-ticket`.

## Tareas
- [x] T1 — Front: reimprimir ticket desde Ventas (builder Sale->SaleTicket, botón, estado de impresión).
      Tests primero. Ruta: delegada (writer front: lectura previa de 4+ archivos + escritura).
      Evidencia: RED (módulos inexistentes) -> GREEN (13/13 builder, 6/6 UI). Full vitest: solo 8 fallos baseline.
      tsc limpio, eslint limpio. Re-corrida mía: 3 suites / 71 passed. Commits: 590c61b, 84b9f94.
      Decisiones: botón en cada tarjeta de venta (no existe drawer de ventas existentes); marca "REIMPRESIÓN" en
      HTML y ESC/POS; imprime en la sucursal de la venta (`sale.branchId`, puede ser null en ventas viejas);
      sin getSaleById (no incluye pagos). No probado con impresora/agente/relay reales.

## Progreso
Rama creada desde main (bbec691).

## Próximo paso
T1.
