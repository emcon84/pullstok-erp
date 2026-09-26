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
- [x] T1 (ee1e77f) — API: `Sale.surcharge` (schema + migración), Zod `surchargePct`, cálculo y
      validación en `createSale`, respuesta. Tests primero. Ruta: delegada (writer).
- [x] T2 — Front: campo "Recargo tarjeta (%)" en `PaymentModal` (solo si hay fila de
      tarjeta), total a cobrar con recargo, wiring `confirmSale`→`useVendorCheckout`→
      `useSales`→API. Tests primero. Ruta: delegada (writer).
- [x] T3 — Front: fila de recargo en ticket HTML y ESC/POS (`saleTicket.ts`, `escpos.ts`).
      Tests primero. Ruta: delegada (mismo writer que T2).

- [x] T4 (a46bc6f) — Front: recargo también en el flujo legacy `SalesDrawer` + `PaymentSection`
      (Ventas, Pedidos, Dashboard; el usuario lo pidió el 2026-09-26). Reusar el helper
      compartido de T2. Un solo writer: arranca cuando T2+T3 cierren. Ruta: delegada.

## Fuera de alcance (decidido por el usuario 2026-09-26)
- Factura (`createInvoiceFromSale`): queda como está; se revisa después.

## Progreso / evidencia
- T0: vitest `vendorOrderPanel.discountReset.test.tsx` 2/2 (RED observado antes del fix).

- T1: jest salesService + cashSessions validation 70/70 (RED 8 fallos antes; spot-check propio 70/70). tsc: 3 errores preexistentes en tests/e2e. Suite unit completa con flakiness preexistente (botService/vendorChat), pasan aisladas.
- Contrato API: request `surchargePct` (0..100) junto a `discountPct`; `payments[].amount` son BASE (Σ = total descontado); respuesta `surcharge`, `totalAmount` (con recargo), filas de tarjeta = base + recargo. Subtotal del ticket = totalAmount − surcharge + discount.
- Abierto (decisión del usuario): `createInvoiceFromSale` arma la factura desde SaleItem (precio × cant) e ignora `Sale.discount` y ahora `surcharge` → el total de la factura difiere de `Sale.totalAmount` con descuento/recargo. Ya era así con descuento; no se tocó.

- T2+T3: helper compartido `lib/surcharge.ts` (`clampSurchargePct`, `computeSurcharge`, `applySurchargeToPayments`). RED 17 tests fallando en 6 archivos; GREEN + spot-check propio 9 archivos / 113 tests. tsc limpio. Suite completa: 2 archivos fallan (`priceKgUpdate.test.tsx` Router context, `productDrawer.test.tsx` labels) — sin relación con lo tocado, preexistencia inferida, no confirmada en HEAD limpio. eslint: errores preexistentes en líneas no tocadas.
- Desvío: la fila "Subtotal" del ticket ahora sale también con recargo sin descuento.
- Teclado: en el input de % de recargo, V/+/- siguen disparando vender/agregar/quitar (igual que los inputs de monto); dígitos no se secuestran.

- T4: recargo en `SalesDrawer` (Ventas/Pedidos/Dashboard). RED 9/9 + 3/3; GREEN y spot-check propio 4 archivos / 12 tests. Suite completa 1031/1039: solo fallan los 2 archivos preexistentes. tsc limpio. eslint: errores preexistentes en Dashboard.tsx. La conversión pedido→venta ya maneja `surchargePct` en el API.
- Decisión del usuario (2026-09-26): se deja el campo "Monto" en `SalesDrawer` (habilita pagos divididos, igual que el modal del POS). Sin él, el drawer solo admitía un medio de pago.
- Nota: `Orders.tsx` y `Quotations.tsx` montan otro `SalesDrawer` cuyo `onConfirm` ignora los pagos: el campo aparece pero no se envía nada (igual que el descuento hoy).

## Próximo paso
Factura (`createInvoiceFromSale`): decidir si refleja descuento y recargo.
