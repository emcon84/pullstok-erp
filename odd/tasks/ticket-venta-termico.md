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
- [x] T5 — Seguimiento "impresión directa": encoder ESC/POS puro (`utils/escpos.ts`: texto transliterado a
      ASCII, layout compacto 32 columnas, logo raster `GS v 0`, ticket de prueba). Ruta: writer único.
      Commit: 80a7a71
- [x] T6 — Transporte Web Serial (`utils/serialPrinter.ts`: soporte, puerto recordado, conectar, imprimir
      bytes en chunks con timeout, desconectar) con `navigator.serial` mockeado. Ruta: writer único. Commit: 53b8924
- [x] T7 — Wiring: `printSaleTicketDirect` (directo con respaldo al panel de Chrome), `handlePrintTicket`,
      botón `PrinterConnectButton` en el header del POS. Ruta: writer único. Commit: d140e5e
- [x] T8 — Fix (rama `fix/ticket-serial-baud`): la prueba real por USB (puerto COM3, puente USB-serie) no
      imprime ni da error → baud configurable (`SUPPORTED_BAUD_RATES` 9600…115200, persistido en
      localStorage), `encodeBaudProbeEscPos`, `probePrinterBaudRates` ("Probar velocidades") y select
      "Velocidad" en el menú de `PrinterConnectButton`. Ruta: writer único. Commit: 08dd8c6
- [x] T9 — Fix: `close()` justo tras el último `write` puede truncar lo que aún sale por el UART →
      `estimateDrainMs` (10 bits/byte x1,15 + 250 ms, tope 8 s) y espera del drenaje antes de cerrar;
      timeout = 10 s + drenaje. Ruta: writer único. Commit: 5c2444f

## Seguimiento: impresión directa (2026-09-24, rama `feature/ticket-impresion-directa`)
Objetivo: imprimir el ticket en la OCOM OCPP-M06 desde la PWA SIN panel de Chrome ni flags/impresora
predeterminada, por Web Serial (`navigator.serial`) con bytes ESC/POS crudos. Flujo: una vez "Conectar
impresora" (gesto de usuario → `requestPort()`), luego `getPorts()` devuelve el puerto recordado y se
imprime en silencio. Solo sirve si Windows expone la impresora como puerto COM (seguro por Bluetooth/SPP;
por USB depende del driver). Degrada siempre: sin puerto, sin soporte o ante cualquier error se usa
`printSaleTicket` (panel de Chrome) como hoy. Nunca se pierde ni se bloquea una venta.

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

Seguimiento impresión directa (rama feature/ticket-impresion-directa):
- T5 (80a7a71): escpos.test.ts 22/22 (RED previo: módulo @/utils/escpos inexistente); saleTicket 48 y
  tsc limpios (se exportaron money/qty/formatDateTime/clean de saleTicket.ts para reusar el formato).
- T6 (53b8924): serialPrinter.test.ts 26/26 con navigator.serial mockeado (RED previo: módulo
  inexistente); tsc limpio.
- T7 (d140e5e): printTicketDirect (10), printerConnectButton (12), ticketLogo (16, +4 del bitmap) y
  unifiedPos.printTicket (17) verdes (RED previo: módulos inexistentes / 12 fallas); suite completa 870 ok /
  8 fallas preexistentes (priceKgUpdate 6, productDrawer 2); tsc limpio.
- NO verificado: impresora real (OCOM OCPP-M06), prompt/persistencia real del permiso de Chrome, si
  Windows expone la impresora como COM (Bluetooth SPP sí; USB depende del driver), baud/COM, página de
  códigos (todo sale transliterado a ASCII), ni el comportamiento en la PWA instalada. Riesgo: si el
  envío directo falla a mitad de ticket (o por timeout con papel ya impreso) el respaldo abre el panel y
  el ticket puede salir duplicado.

Seguimiento baud/drenaje (rama fix/ticket-serial-baud):
- T8 (08dd8c6): escpos 24, serialPrinter 43 y printerConnectButton 17 verdes (RED previo: 25 fallas por
  exports inexistentes); tsc limpio; unifiedPos/printTicketDirect/saleTicket verdes.
- T9 (5c2444f): serialPrinter 51/51 (RED previo: 22 fallas por `estimateDrainMs` inexistente; RED de
  comportamiento confirmado quitando la espera: fallan los 3 tests de drenaje/timeout). Se actualizó el
  test de timeout existente: avanza PRINT_TIMEOUT_MS + drenaje (el tope ahora es 10 s + drenaje).
- NO verificado: impresora real, que el baud correcto haga salir papel por el puente USB, comportamiento
  real de `port.close()` en Chrome/Windows ni el tiempo real de drenaje (es una estimación).

Seguimiento: impresión directa desactivada (rama worktree-ticket-panel-only):
- La sonda de velocidades mostró 5 baud "OK" sin que saliera papel. El único puerto serie era un FTDI
  FT232R (vendor 0x0403 / product 0x6001); no se llegó a confirmar si era el puente de la impresora.
  Decisión del usuario: configurar la impresora exige ir y venir a la PC de la impresora, así que el POS
  vuelve a abrir SIEMPRE el panel de impresión de Chrome.
- UnifiedPos llama a `printSaleTicket` y ya no muestra "Conectar impresora". Los módulos
  serialPrinter / escpos / printTicketDirect / PrinterConnectButton siguen en el repo, sin uso desde la UI.
- Tests: unifiedPos.printTicket 16/16 (RED previo: 2 fallas: botón visible y escritura al puerto con
  una térmica serial conectada); suite completa 903 ok / 8 fallas preexistentes; tsc limpio.
