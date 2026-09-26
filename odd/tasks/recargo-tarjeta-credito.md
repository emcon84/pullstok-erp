# Recargo por tarjeta de crédito + descuento que no se arrastra entre ventas

## Objetivo
1. El descuento % del POS no debe pasar a la venta siguiente.
2. Cuando un medio de pago es TARJETA_CREDITO, el vendedor puede cargar un
   recargo (%) que se aplica SOLO sobre la parte pagada con tarjeta.

## Decisiones (confirmadas con el usuario 2026-09-26)
- Base del recargo: solo el monto pagado con tarjeta de crédito (no el total).
- Recargo en porcentaje (mismo patrón que el descuento).

## Decisiones de diseño (defaults míos, sin confirmar)
- Los montos que el vendedor tipea en el modal son BASE (antes del recargo); la
  suma sigue siendo el total descontado. El recargo se muestra aparte y el
  "total a cobrar" del modal = total + recargo.
- El servidor es autoridad: `surchargePct` (0..100) en el request; recargo =
  Σ por fila TARJETA_CREDITO de round2(monto × pct / 100). Cada fila de tarjeta
  se guarda con monto + su recargo. `Sale.totalAmount` INCLUYE el recargo;
  `Sale.surcharge` (Float, default 0) guarda el monto. Σ payments == totalAmount.
- Alcance: POS unificado (PaymentModal ← VendorOrderPanel). El flujo legacy
  (PaymentSection / SalesDrawer / VendorCartSheet) queda fuera.

## Hechos verificados
- Descuento: estado `discountStr` en `VendorOrderPanel.tsx`; el panel queda montado.
- Backend: `salesService.ts` ~L456 calcula descuento server-side; ~L475 valida
  Σ payments == totalAmount.
- `PaymentMethod`: EFECTIVO, TARJETA_CREDITO, TARJETA_DEBITO, TRANSFERENCIA, QR.
- Tickets: `utils/saleTicket.ts` (HTML) y `utils/escpos.ts` renderizan la fila de descuento.

## Contexto de checks
- TDD: estricto (config del usuario). Backend jest (`api/`, unit sin DB), front vitest.
- Migraciones: las aplica el pipeline — NO correr manual.
- Estimación: ~350 líneas autorales. Estrategia de entrega: ask-on-risk.

## Tareas
- [x] T0 — Front: resetear descuento al vaciarse el carrito (`VendorOrderPanel`). Test RED→GREEN. Ruta: inline.
- [ ] T1 — API: `Sale.surcharge` (schema + migración), Zod `surchargePct`, cálculo y
      validación en `createSale`, respuesta. Tests primero. Ruta: delegada (writer).
- [ ] T2 — Front: campo "Recargo tarjeta (%)" en `PaymentModal` (solo si hay fila de
      tarjeta), total a cobrar con recargo, wiring `confirmSale`→`useVendorCheckout`→
      `useSales`→API. Tests primero. Ruta: delegada (writer).
- [ ] T3 — Front: fila de recargo en ticket HTML y ESC/POS (`saleTicket.ts`, `escpos.ts`).
      Tests primero. Ruta: delegada (mismo writer que T2).

## Progreso / evidencia
- T0: vitest `vendorOrderPanel.discountReset.test.tsx` 2/2 (RED observado antes del fix).

## Próximo paso
T1.
