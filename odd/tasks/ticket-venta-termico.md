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
- [ ] T2 — Snapshot en checkout + diálogo Sí/No + wiring en UnifiedPos (con tests).
      Ruta: delegada (writer). Commit: pendiente

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
  ADMIN/MANAGEMENT y `me()` no devuelve `phone` de la organización: para VENDEDOR el teléfono
  se omite y la dirección sale de la organización (sin tocar la API).

## Entrega
Rama `feature/ticket-venta-termico`. Estimado ~350 líneas. Push/merge: decisión del usuario.

## Progreso
Creado 2026-09-24.
- T1 (f423486): `npx vitest run src/__tests__/saleTicket.test.ts` → 39/39 verdes (RED previo: módulo
  `@/utils/saleTicket` inexistente); `tsc --noEmit -p tsconfig.app.json` limpio.
Próximo paso: T2.
