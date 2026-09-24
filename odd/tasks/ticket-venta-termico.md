# Ticket de venta en impresora térmica 58 mm

## Objetivo
Después de confirmar una venta en el POS del vendedor, preguntar "¿Imprimir ticket?".
Si dice Sí, imprimir un ticket no fiscal en la impresora térmica OCOM OCPP-M06
(58 mm, ya instalada como impresora de Windows). Si dice No, no pasa nada más.

## Por qué
Los clientes que no piden factura igual necesitan un comprobante simple de lo que
compraron.

## Decisión de producto (confirmada con el usuario, 2026-09-24)
- Pregunta al vendedor por venta (Sí / No), DESPUÉS de que la venta se confirmó OK.
  No hay auto-impresión ni toggle persistente "por ahora".
- Camino A: driver de Windows + impresión del navegador. Sin ESC/POS ni WebUSB.

## Diseño
- Ticket = snapshot tomado ANTES de `clearCart()` en `useVendorCheckout`
  (renglones, descuento, total, medios de pago, fecha, nombre del negocio).
- `buildTicket` (puro) → modelo; `renderTicketHtml` (puro) → HTML con
  `@page { size: 58mm auto; margin: 0 }`; `printTicket` imprime desde un iframe
  oculto (el `@page` A4 global de index.css no interfiere).
- Diálogo `PrintTicketDialog` en UnifiedPos: Sí / No, con teclado (S/Enter = sí, N/Esc = no).
- Fuera de alcance: número de ticket/venta (createSale del front devuelve void),
  impresión silenciosa (kiosk-printing), ESC/POS, otras vistas legacy.

## Tareas
- [x] T1 — Modelo + render + impresión del ticket (puro, con tests).
      Ruta: delegada (writer). Commit: f423486
- [x] T2 — Snapshot en checkout + diálogo Sí/No + wiring en UnifiedPos (con tests).
      Ruta: delegada (writer). Commit: e6807e4
- [x] T3 — Fix: el diálogo "¿Imprimir ticket?" quedaba abierto al imprimir (window.print() bloquea el
      hilo y la animación de salida no termina). Cerrar primero, imprimir ~300 ms después, sin que un
      error de impresión pueda reabrir/dejar el diálogo. Ruta: delegada (writer). Commit: a9e27ff
- [x] T4 — Fix: el logo claro/blanco (pensado para tema oscuro) no se veía en el ticket. Pre-procesar en
      canvas (fetch → dataURL → composición sobre blanco, inversión de glifo claro, escala de grises);
      si falla algo, se usa la URL original con el filtro CSS. Ruta: delegada (writer). Commit: 624cdcf

## Checks
- TDD: strict (RED → GREEN → REFACTOR), runner `npx vitest run` en `pullstok-front/`.
- `npx tsc --noEmit -p tsconfig.app.json` limpio.
- Fallas preexistentes en main (no tocar): priceKgUpdate.test.tsx (6), productDrawer.test.tsx (2).

## Requisitos agregados por el usuario (2026-09-24)
- Layout compacto: 2 líneas por ítem (nombre recortado a 28 chars + detalle/total), sin
  separadores entre ítems, sin alturas fijas; fuente ~10,5px.
- Logo (`branding.logoUrl`) en el encabezado, escala de grises, espera a que cargue (3 s máx).
- Datos de empresa (solo si existen): CUIT, condición fiscal, dirección, teléfono. Dirección y
  teléfono de la sucursal con respaldo en la organización. `GET /branches` es solo
  ADMIN/MANAGEMENT; `me()` ahora devuelve también `organization.phone` (8250c7f). Para
  VENDEDOR la query de sucursales queda deshabilitada y dirección/teléfono salen de la
  organización; ADMIN/MANAGEMENT usan los de la sucursal con respaldo en la organización.

## Entrega
Rama `feature/ticket-venta-termico`. Estimado ~350 líneas. Push/merge: decisión del usuario.

## Progreso
Creado 2026-09-24.
- T1 (f423486): `npx vitest run src/__tests__/saleTicket.test.ts` → 39/39 verdes (RED previo: módulo
  `@/utils/saleTicket` inexistente); `tsc --noEmit -p tsconfig.app.json` limpio.
- T2 (e6807e4): printTicketDialog (14), useVendorCheckout.ticket (6) y unifiedPos.printTicket (9)
  → 29/29 verdes (RED previo: 13 fallas + import faltante); suite completa del front 771 ok /
  8 fallas preexistentes (priceKgUpdate 6, productDrawer 2); `tsc --noEmit -p tsconfig.app.json`
  limpio.
- T3 (a9e27ff): unifiedPos.printTicket 12/12 (RED previo: 2 fallas + error no atrapado; el diálogo se
  cierra antes de imprimir y un throw no lo deja abierto); tsc limpio.
- T4 (624cdcf): ticketLogo (12) + saleTicket (48) + unifiedPos.printTicket (12) verdes (RED previo: módulo
  ticketLogo inexistente); suite completa 791 ok / 8 fallas preexistentes (priceKgUpdate 6,
  productDrawer 2); tsc limpio. NO verificado: navegador/impresora reales ni que el bucket R2 envíe
  CORS (sin CORS el fetch falla y se usa la URL original con el filtro CSS, o sea el logo claro sigue
  sin verse).
Próximo paso: revisión del usuario / push (decisión del usuario).
