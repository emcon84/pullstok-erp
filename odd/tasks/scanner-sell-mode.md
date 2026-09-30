# Scanner: modo Vender (agregar al pedido y cobrar desde el celular)

## Objetivo
Desde `/scanner` (`StockScannerPage.tsx`) poder armar y cobrar una venta con el celular: escanear, que el
producto se sume al pedido, repetir con varios productos, y cobrar sin salir de la pantalla.

## Decisiones (usuario, 2026-09-30)
- Prioridad absoluta: que sea SUPER FÁCIL de usar; el usuario puede agregar más de 1 producto a la venta.
- El usuario delegó el enfoque: venta directa en el scanner (sin navegar a Vender) si queda mejor.

## Decisiones de diseño (defaults míos, sin confirmar)
- Selector de modo arriba en el scanner: Stock (actual, sin cambios) | Vender.
- En modo Vender cada escaneo suma 1 al pedido automáticamente y queda listo para el siguiente escaneo.
- Aviso corto "Agregado: Nombre ×N" con + / − para corregir la cantidad.
- Barra fija inferior: ítems + total; abre `VendorCartSheet` (ya usado por `PriceKgLookup`) para revisar/cobrar.
- Reusar `useVendorCart` (localStorage `vendor-cart`), no crear otro carrito.

## Hechos verificados
- Scanner hoy: solo ajuste de stock; no importa `useVendorCart`. Resolución: `lookupProductByCode`
  (IndexedDB) → `GET /products/by-code/{code}` → sheet de asignación si no existe.
- `addToCart(product, quantity, branchId, stock, saleMode?, priceKgSueltoOverride?, loosePriceId?, looseName?,
  sellsWholesale?, piecesPerBlister?)` en `components/hooks/useVendorCart.ts`.
- Modo de sucursal del scanner por rol: `ScannerBranchMode` (`constants/rolePermissions.ts:112`).

## Pendiente de verificar al implementar
- Que el cobro (`VendorCartSheet` + checkout) funcione igual fuera de Vender: caja abierta, sucursal, pago.
- Comportamiento con productos por peso/sueltos/blister al escanear (qué sale en modo Vender).

## Contexto de checks
- TDD: estricto (config de sesión). Runner front: vitest (`pullstok-front/`, `npx vitest run <archivo>`);
  `npx tsc -p tsconfig.app.json --noEmit`; 8 fallos preexistentes (priceKgUpdate x6, productDrawer x2).
  Sin backend/BD local: verificación visual real la hace el usuario tras el deploy.
- Heurística ~400 líneas/tarea. Rama `feat/scanner-sell-mode`; push/merge a `main` cuando el usuario lo pida.

## Tareas
- [x] T0 — Fix overflow mobile en "Vender" (`UnifiedPos.tsx`: `flex-wrap` en la fila de tabs/botones). Ruta: inline.
- [x] T1 — Lógica: auto-agregar al carrito al escanear en modo Vender + tests primero. Commit d109a0d. Ruta: delegada (writer).
- [x] T2 — UI: selector de modo, aviso con +/−, barra inferior y `VendorCartSheet` + tests. Commit 7f52bcf. Ruta: delegada (writer).

## Progreso
- T0 hecho (sin verificación visual en celular).

- T1: `components/hooks/useScannerSell.ts` (`planScanSell` puro + hook) y `__tests__/useScannerSell.test.tsx`.
  RED: módulo inexistente (suite no cargó). GREEN: 14/14.
- T2: `components/organisms/ScannerSellPanel.tsx` (aviso +/−, barra fija, VendorCartSheet, checkout, caja) +
  cambios mínimos en `views/StockScannerPage.tsx` (selector Stock|Vender, refs de modo, reanuda cámara tras
  cada escaneo con pausa de 1.5 s). Tests: `scannerSellPanel.test.tsx` (8) y `stockScannerSellMode.test.tsx`
  (7; RED: 6 fallaban antes de tocar la página, GREEN: 7/7). `stockScannerPage.test.tsx` intacto (5/5).
- Checks: `npx tsc -p tsconfig.app.json --noEmit` limpio; eslint limpio en archivos nuevos (StockScannerPage
  conserva 2 errores PREEXISTENTES rules-of-hooks en useSearchParams/useNavigate); suite completa:
  8 fallos = los preexistentes (priceKgUpdate x6, productDrawer x2), 1221 pasan.
- Decisiones: escaneo => siempre BOLSA_CERRADA (igual que catálogo con "Vender por unidad" apagado); stock de
  sucursal vía `GET /products/:id/stock` por escaneo (online; sin dato => no agrega y avisa); sueltos por kg y
  blister NO se auto-agregan desde el scanner (piden peso/monto/conteo; se venden desde sus pantallas).
- Cobro fuera de Vender: mismo cableado que `PriceKgLookup` (useVendorCheckout + useGetCurrentCashSession +
  VendorCartSheet), que ya vive fuera de la página Vender; verificado por tests con mocks, NO en dispositivo.
- Limitaciones sin verificar: precio mayorista (el catálogo offline no trae `wholesalePrice`; el server
  revalida al cobrar); no se imprime ticket tras cobrar (igual que PriceKgLookup); sin verificación visual real.

## Próximo paso
Verificación visual/real del usuario tras el deploy (celular: escaneo continuo, cobro con caja abierta).
