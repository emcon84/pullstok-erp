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
- T2 (e6807e4): 
 RUN  v5.0.1 C:/Users/Emiliano/pullstok-erp

 ❯ api/tests/services/whatsappFlow.test.ts (0 test)
 ❯ api/tests/validation/schemas.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/saleTicket.test.ts (0 test)
 ❯ api/tests/services/salesService.test.ts (0 test)
 ❯ api/tests/controllers/productController.bulkPrice.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/dashboard.test.tsx (0 test)
 ❯ api/tests/controllers/providerPriceListController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/productDrawer.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/bulkPriceUpdate.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/branding.test.tsx (0 test)
 ❯ api/tests/controllers/productController.planSection.test.ts (0 test)
 ❯ pullstok-front/src/components/hooks/__tests__/useOpenBag.test.ts (17 tests | 17 failed) 39ms
   ❯ useOpenBag hook (17)
     ❯ cellOptions loading (3)
       × loads cell options on mount with loadingCells true initially 11ms
       × calls all three services in parallel via Promise.all 2ms
       × handles loading error and sets empty cellOptions 2ms
     ❯ searchProduct (7)
       × calls GET /products/by-scan/:barcode and returns ProductScanResult for valid product 2ms
       × rejects with correct error when isScale is true 1ms
       × rejects with correct error when product.weightKg is null 1ms
       × rejects with correct error when product.weightKg is 0 1ms
       × rejects with correct error when product.weightKg is negative 2ms
       × rejects with correct error on network failure 1ms
       × clears error when clearError is called 1ms
     ❯ openBag (6)
       × calls looseStock.openBag with correct payload 1ms
       × throws translated error for LOOSE_BAG_INSUFFICIENT_STOCK 1ms
       × throws translated error for LOOSE_LINE_NOT_FOUND 1ms
       × throws generic error for other LOOSE_* errors 1ms
       × throws generic error for network failure 2ms
       × clears error when clearError is called after openBag failure 1ms
     ❯ initial state (1)
       × has correct initial state 1ms
 ❯ pullstok-front/src/__tests__/unifiedPos.test.tsx (0 test)
 ❯ api/tests/services/fiscalInvoiceService.test.ts (0 test)
 ❯ api/tests/services/authService.test.ts (0 test)
 ❯ api/tests/services/whatsappCatalog.test.ts (0 test)
 ❯ api/tests/controllers/priceLooseService.test.ts (0 test)
 ❯ api/tests/controllers/priceListController.test.ts (0 test)
 ❯ api/tests/controllers/branchController.test.ts (0 test)
 ❯ api/tests/controllers/branchStockController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/priceKgLookup.test.tsx (0 test)
 ❯ api/tests/services/cashSessionService.test.ts (0 test)
 ❯ api/tests/controllers/arcaCertificatesController.test.ts (0 test)
 ❯ api/tests/integrations/wsaaClient.test.ts (0 test)
stdout | api/tests/e2e/branch-stock.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/branch-stock.e2e.test.ts (0 test)
stdout | api/tests/e2e/bulk-price-update.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/bulk-price-update.e2e.test.ts (0 test)
stdout | api/tests/e2e/bulk-price-overrides.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/bulk-price-overrides.e2e.test.ts (0 test)
stdout | api/tests/e2e/invoicing.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/invoicing.e2e.test.ts (0 test)
stdout | api/tests/e2e/priceListImport.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/priceListImport.e2e.test.ts (0 test)
stdout | api/tests/e2e/roles-system.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/roles-system.e2e.test.ts (0 test)
 ❯ api/tests/integrations/wsfev1Client.test.ts (0 test)
 ❯ api/tests/services/priceMatchingService.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/PriceListImport.test.tsx (0 test)
 ❯ pullstok-front/src/components/molecules/__tests__/OpenBagDialog.test.tsx (0 test)
 ❯ api/tests/controllers/priceKgReviewController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/printGrouping.test.ts (0 test)
 ❯ api/tests/services/salesService.multipack.test.ts (0 test)
 ❯ api/tests/controllers/authController.test.ts (0 test)
stdout | api/tests/e2e/sale-invoicing.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/sale-invoicing.e2e.test.ts (0 test)
stdout | api/tests/e2e/pricing-settings.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/pricing-settings.e2e.test.ts (0 test)
stdout | api/tests/e2e/cash-session.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/cash-session.e2e.test.ts (0 test)
 ❯ api/tests/services/vendorChatService.test.ts (0 test)
 ❯ api/tests/services/stockService.test.ts (0 test)
stdout | api/tests/e2e/loose-sale.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/loose-sale.e2e.test.ts (0 test)
stdout | api/tests/e2e/arca.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/arca.e2e.test.ts (0 test)
 ❯ api/tests/services/providerPriceListService.test.ts (0 test)
 ❯ api/tests/services/productsService.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/businessHoursForm.test.tsx (0 test)
 ❯ api/tests/services/arcaCalc.test.ts (0 test)
stdout | api/tests/e2e/categories-tree.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/categories-tree.test.ts (0 test)
 ❯ api/tests/services/whatsappCatalogCache.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/unifiedPos.printTicket.test.tsx (0 test)
 ❯ api/tests/controllers/productController.barcodes.test.ts (0 test)
 ❯ api/tests/middlewares/planLimitMiddleware.test.ts (0 test)
 ❯ api/tests/services/botService.test.ts (0 test)
 ❯ api/tests/controllers/invoiceController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/unifiedPos.blisterUnit.test.tsx (0 test)
stdout | api/tests/e2e/store-branch-stock.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/store-branch-stock.e2e.test.ts (0 test)
stdout | api/tests/e2e/variants.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/variants.test.ts (0 test)
 ❯ api/tests/services/salesService.blisterUnit.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/priceKgProductPanel.test.tsx (0 test)
 ❯ api/tests/controllers/productSearchWhere.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/stockScannerPage.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/unifiedPos.openBag.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/priceKgUpdate.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/InvoiceForm.test.tsx (0 test)
stdout | api/tests/e2e/password-recovery.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/password-recovery.e2e.test.ts (0 test)
 ❯ api/src/services/__tests__/looseSaleService.test.ts (0 test)
 ❯ api/tests/controllers/pricingController.test.ts (0 test)
 ❯ api/tests/controllers/customerController.test.ts (0 test)
stdout | api/tests/e2e/onboarding.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/onboarding.e2e.test.ts (0 test)
 ❯ api/tests/controllers/priceKgBrandController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/productFilter.test.ts (0 test)
 ❯ api/tests/services/backupService.test.ts (0 test)
 ❯ api/tests/controllers/priceKgTypeController.test.ts (0 test)
 ❯ api/tests/controllers/storeController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/catalogMultipack.test.tsx (0 test)
 ❯ api/tests/controllers/vendorChatController.test.ts (0 test)
 ❯ api/tests/controllers/productController.productChanged.test.ts (0 test)
 ❯ api/src/validation/__tests__/categories-variants.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/filterChips.test.tsx (0 test)
 ❯ api/tests/controllers/productController.test.ts (0 test)
 ❯ api/tests/services/matching.test.ts (0 test)
 ❯ api/src/services/__tests__/providerPriceListService.test.ts (0 test)
stdout | api/tests/e2e/products-variants.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/products-variants.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/vendorDashboard.test.tsx (0 test)
 ❯ api/tests/controllers/cashSessionController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/arcaSettingsForm.test.tsx (0 test)
 ❯ api/tests/controllers/priceKgPlanController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/PriceListDetail.test.tsx (0 test)
 ❯ api/tests/services/nameNormalization.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/quickPriceModal.test.tsx (0 test)
stdout | api/tests/e2e/branding.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/branding.e2e.test.ts (0 test)
 ❯ api/src/validation/__tests__/cashSessions.test.ts (0 test)
 ❯ api/tests/integrations/padronClient.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/printProductList.test.tsx (0 test)
 ❯ api/tests/services/whatsappService.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/useCashSession.test.tsx (7 tests | 7 failed) 26ms
   ❯ useCashSession — wiring (7)
     × useGetCurrentCashSession fetches the OPEN session on mount 12ms
     × useGetCurrentCashSession includes branchId in query key and propagates it 3ms
     × useGetCurrentCashSession returns null session when backend has none 2ms
     × useGetCashSessions fetches the list and maps to items 2ms
     × useGetCashSession fetches a single session by id 2ms
     × useOpenCashSession mutates openCashSession 2ms
     × useCloseCashSession mutates closeCashSession with id + payload 1ms
 ❯ api/tests/controllers/moduleController.test.ts (0 test)
 ❯ api/tests/controllers/salesController.test.ts (0 test)
 ❯ api/tests/utils/businessHours.test.ts (0 test)
 ❯ api/tests/controllers/productController.offlineSnapshot.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/offlineCatalog.test.ts (9 tests | 9 failed) 41ms
   ❯ offlineCatalog — patch puntual (T3) (9)
     ❯ patchProduct (2)
       × agrega un producto nuevo y lo deja buscable por code/barcode y por nombre 13ms
       × actualiza un producto existente (mismo id) sin duplicarlo y con los datos nuevos 4ms
     ❯ removeProductFromCatalog (2)
       × saca el producto del catálogo y deja de aparecer en búsquedas 2ms
       × es un no-op seguro si el id no existe 4ms
     ❯ fetchAndPatchProduct (5)
       × 200 OK: parsea el JSON y patchea el producto 3ms
       × 404: remueve el producto local en vez de tirar error 5ms
       × otro error HTTP (500): no rompe y no modifica el catálogo 2ms
       × error de red: no rompe (no lanza excepción) 2ms
       × sin token: no hace fetch y no rompe 2ms
 ❯ api/tests/controllers/arcaSettingsController.test.ts (0 test)
stdout | api/tests/e2e/superadminBilling.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/superadminBilling.e2e.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/priceListsService.test.ts (7 tests | 7 failed) 20ms
   ❯ priceLists service — cliente API de planillas (7)
     × importPriceList sube el PDF como multipart con el token (dryRun=true) 10ms
     × importPriceList lanza error con status cuando el server responde 413/400 1ms
     × applyPriceList envía las decisiones como JSON 1ms
     × getPriceLists consulta /price-lists con el token 1ms
     × getPriceList consulta el detalle por id 1ms
     × adjustPriceList arma el query dryRun y envía el payload 1ms
     × searchProducts devuelve hits id/name/price (forma paginada del server) 1ms
 ❯ api/tests/controllers/productController.branchFilter.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/looseStock.test.ts (10 tests | 10 failed) 25ms
   ❯ looseStock service — stock suelto de la planilla (10)
     ❯ getLooseStock (3)
       × GET /loose-stock/:lineId?branchId= y devuelve la línea 9ms
       × sin branchId omite el query param 1ms
       × celda inexistente → lanza el mensaje del server (404) 1ms
     ❯ setLooseStock (2)
       × PUT /loose-stock/:lineId con { branchId, quantity } 1ms
       × errores de dominio → lanza data.message 1ms
     ❯ listLooseStocks (3)
       × GET /loose-stock con branchId opcional y devuelve { items } 1ms
       × sin branchId lista toda la org (sin query) 1ms
       × respuesta sin items → siempre un array 1ms
     ❯ openBag (2)
       × POST /loose-stock/open-bag con { productId, branchId, priceKgPriceId } 4ms
       × LOOSE_* 422 → lanza data.message (sin bolsa/peso/línea) 1ms
 ❯ api/tests/controllers/brandingController.test.ts (0 test)
 ❯ api/tests/integrations/soapClient.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/cashSessionPage.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/planillaGroups.test.ts (0 test)
 ❯ api/tests/config/modules.test.ts (0 test)
 ❯ api/tests/scripts/assign-scale-codes.unit.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/cashSession.checkout.test.tsx (0 test)
 ❯ api/src/utils/__tests__/unitsPerBox.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/PrintInvoice.test.tsx (0 test)
 ❯ api/tests/scripts/migrate-branch-stock.test.ts (0 test)
stdout | api/tests/e2e/business-hours.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/business-hours.e2e.test.ts (0 test)
 ❯ api/src/utils/__tests__/certEncryption.test.ts (0 test)
 ❯ api/tests/services/organizationService.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/useVendorCheckout.ticket.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/authInterceptor.test.ts (8 tests | 4 failed) 21ms
   ❯ authInterceptor — 403 OUTSIDE_BUSINESS_HOURS (4)
     × limpia la sesión y redirige a /fuera-de-horario ante un 403 OUTSIDE_BUSINESS_HOURS 8ms
     × NO redirige en loop si ya estamos en /fuera-de-horario 1ms
     × NO limpia la sesión ante otros 403 (p.ej. PLAN_LIMIT) 1ms
     × NO limpia la sesión ante 401 de login/refresh (credenciales inválidas) 1ms
 ❯ api/tests/services/categoryService.test.ts (0 test)
 ❯ api/src/utils/__tests__/certParsing.test.ts (0 test)
 ❯ api/tests/middlewares/checkBusinessHours.test.ts (0 test)
 ❯ api/tests/controllers/businessHoursController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/Customers.test.tsx (0 test)
 ❯ api/tests/config/storage.test.ts (0 test)
 ❯ api/tests/controllers/productController.list.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/useProductStock.test.tsx (0 test)
 ❯ api/tests/controllers/storeSettingsController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/useVendorCart.blisterUnit.test.ts (5 tests | 5 failed) 16ms
   ❯ useVendorCart — POR_UNIDAD_BLISTER (venta-pastillas-sueltas-blister) (5)
     × computes the line price from piecesPerBlister (ceil to $100), not from product.unitsPerBox 8ms
     × cart total = price-per-piece × pieces sold 1ms
     × merges two addToCart calls with the SAME piecesPerBlister into one line 1ms
     × keeps DIFFERENT piecesPerBlister as separate lines (each blister scan has its own count) 1ms
     × BOLSA_CERRADA line for the same product stays a separate line from POR_UNIDAD_BLISTER 1ms
 ❯ api/tests/controllers/padronController.test.ts (0 test)
 ❯ api/tests/controllers/backupController.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/useVendorCheckout.multipack.test.tsx (0 test)
stdout | api/tests/e2e/modules.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/modules.e2e.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/storeSettingsForm.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/bulkPriceUpdateService.test.ts (7 tests | 7 failed) 20ms
   ❯ bulkPriceUpdate service — dryRun preview + apply (7)
     × sends the payload with the auth token on a dryRun preview (page 1) 8ms
     × passes the requested page to the dryRun endpoint 1ms
     × calls the plain endpoint (no dryRun flag) for an apply 1ms
     × throws the server message when the request fails 1ms
     × returns the parsed preview/apply envelope 1ms
     × sends the per-category and per-product override arrays in the request body 1ms
     × exposes the server-computed effectivePercentage on every preview row 1ms
 ❯ pullstok-front/src/__tests__/looseStockAdmin.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/organizationFiscalForm.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/BranchesPage.test.tsx (0 test)
 ❯ pullstok-front/src/components/hooks/__tests__/useProductCatalogRealtime.test.ts (7 tests | 7 failed) 33ms
   ❯ useProductCatalogRealtime (7)
     × no se conecta si no hay token en localStorage 13ms
     × se conecta con el token de localStorage y se suscribe a product:changed 2ms
     × action 'updated' -> llama fetchAndPatchProduct con el productId, sin remover 2ms
     × action 'created' -> llama fetchAndPatchProduct con el productId 2ms
     × action 'deleted' -> llama removeProductFromCatalog con el productId, sin patchear 4ms
     × cleanup: hace socket.off('product:changed', handler) al desmontar, sin desconectar el socket compartido 3ms
     × no rompe si fetchAndPatchProduct rechaza (fire-and-forget) 2ms
 ❯ pullstok-front/src/__tests__/priceKgReview.test.ts (6 tests | 6 failed) 19ms
   ❯ priceKgReview service — cola de revisión y productos por celda (6)
     ❯ listQueue (2)
       × GET /price-kg-review/queue con filtros y paginación en query 9ms
       × lanza el mensaje del server cuando falla 1ms
     ❯ autoApply (1)
       × POST /price-kg-review/auto-apply y devuelve {applied, queued, skipped} 1ms
     ❯ approveEntry / rejectEntry (2)
       × approveEntry hace POST a /queue/:id/approve 1ms
       × rejectEntry hace POST a /queue/:id/reject 1ms
     ❯ listProductsForCell (1)
       × GET /price-kg-products con brandId+typeId+species 1ms
 ❯ pullstok-front/src/__tests__/cartItemRow.test.tsx (0 test)
 ❯ api/tests/integrations/traSigner.test.ts (0 test)
stdout | api/tests/e2e/auth-kill-switch.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/auth-kill-switch.e2e.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/PrintPriceList.test.tsx (0 test)
 ❯ api/tests/scripts/seed-fake-loose-stock.unit.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/adminReviewQueue.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/printBulkPriceList.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/categoryTreeMulti.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/useStockSummary.test.tsx (0 test)
 ❯ api/tests/controllers/productController.multipack.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/priceKgBrandsService.test.ts (8 tests | 8 failed) 19ms
   ❯ priceKgBrands service — cliente API de marcas por kilo (8)
     ❯ parseKeywords (3)
       × hace trim, filtra vacíos y deduplica sin distinguir mayúsculas 9ms
       × devuelve [] para un string vacío 1ms
       × devuelve una única palabra clave sin comas 1ms
     × listPriceKgBrands devuelve data.items con el token 1ms
     × createPriceKgBrand envía name y keywords y devuelve la marca 1ms
     × createPriceKgBrand lanza el mensaje del server cuando falla 1ms
     × updatePriceKgBrand hace PUT a /:id 1ms
     × deletePriceKgBrand hace DELETE a /:id y no devuelve nada 1ms
 ❯ pullstok-front/src/__tests__/printTicketDialog.test.tsx (0 test)
 ❯ api/tests/integrations/mockArcaClient.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/modules.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/priceKgTypesService.test.ts (8 tests | 8 failed) 24ms
   ❯ priceKgTypes service — cliente API de tipos por kilo (8)
     ❯ parseSynonyms (3)
       × hace trim, filtra vacíos y deduplica sin distinguir mayúsculas 13ms
       × devuelve [] para un string vacío 1ms
       × devuelve un único sinónimo sin comas 1ms
     × listPriceKgTypes devuelve data.items con el token 1ms
     × createPriceKgType envía name y synonyms y devuelve el tipo 1ms
     × createPriceKgType lanza el mensaje del server cuando falla 1ms
     × updatePriceKgType hace PUT a /:id 1ms
     × deletePriceKgType hace DELETE a /:id y no devuelve nada 1ms
 ❯ api/tests/middlewares/checkArcaEnabled.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/productDrawer.multipack.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/useSales.branchId.test.tsx (3 tests | 3 failed) 18ms
   ❯ useGetSales — branchId in queryKey (3)
     × includes branchId in queryKey when provided 10ms
     × uses queryKey ['sales'] when branchId is undefined (backward-compat) 3ms
     × isolates cache — ['sales', 'br-a'] and ['sales', 'br-b'] are separate queries 2ms
 ❯ pullstok-front/src/__tests__/generatedBarcodes.test.tsx (0 test)
 ❯ api/src/validation/__tests__/unitsPerBoxSchema.test.ts (0 test)
stdout | api/tests/e2e/dashboard-branch-scope.e2e.test.ts
PostgreSQL connected via Prisma

 ❯ api/tests/e2e/dashboard-branch-scope.e2e.test.ts (0 test)
 ❯ api/tests/services/rateLimiter.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/useVendorCatalog.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/useVendorCart.multipack.test.ts (5 tests | 5 failed) 14ms
   ❯ useVendorCart — dual-line box + por unidad (5)
     × same product box + unit = 2 distinct lines with different saleMode 7ms
     × merges two POR_UNIDAD addToCart of the same product (same line) 1ms
     × cart total = box(price×boxes) + unit(perUnitPrice×units) 1ms
     × box line keeps product.price (never perUnitPrice) 1ms
     × non-eligible product (no unitsPerBox) keeps current box-only behavior 1ms
 ❯ api/tests/scripts/migrate-branch-stock.unit.test.ts (0 test)
 ❯ pullstok-front/src/components/ui/__tests__/searchable-select.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/useProducts.priceListType.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/productsTableSortMemo.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/useVendorCheckout.blisterUnit.test.tsx (0 test)
 ❯ api/tests/utils/scaleCsv.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/PriceListList.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/priceKgCsvExport.test.ts (0 test)
 ❯ api/src/utils/__tests__/internalBarcode.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/modulesSettings.test.tsx (0 test)
 ❯ api/tests/middlewares/uploadMiddleware.test.ts (0 test)
 ❯ api/tests/services/whatsappReactivation.test.ts (0 test)
 ❯ api/tests/services/priceNormalization.test.ts (0 test)
 ❯ api/tests/services/invoiceCalc.test.ts (0 test)
 ❯ api/tests/config/planLimits.test.ts (0 test)
 ❯ api/tests/scripts/unitsPerBoxMigration.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/useProducts.cache.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/useSales.blisterUnit.test.tsx (1 test | 1 failed) 21ms
   ❯ useCreateSale — payload de línea de pastillas sueltas de blister (1)
     × sends piecesPerBlister in products[] for a POR_UNIDAD_BLISTER line 11ms
 ❯ pullstok-front/src/__tests__/quantityModal.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/docTable.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/useVendorRowsKeyboard.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/afipQrImage.test.ts (0 test)
 ❯ api/tests/scripts/seed-fake-farmacia-stock.unit.test.ts (0 test)
 ❯ api/tests/services/suggestedPrice.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/CategoryOverridesPanel.test.tsx (0 test)
 ❯ pullstok-front/src/__tests__/storeSettingsService.test.ts (2 tests | 2 failed) 15ms
   ❯ storeSettingsService — storeBranchId (2)
     × sends storeBranchId in the update payload 10ms
     × returns storeBranchId from the fetched settings 2ms
 ❯ pullstok-front/src/__tests__/transitionSearchInput.test.tsx (0 test)
 ❯ pullstok-front/src/components/hooks/__tests__/useSettledValue.test.ts (4 tests | 4 failed) 29ms
   ❯ useSettledValue (4)
     × arranca con el valor inicial 14ms
     × no adopta el nuevo valor hasta que pasa el delay sin cambios 5ms
     × cada cambio reinicia la espera (solo el último valor se adopta) 4ms
     × flush adopta el último valor al instante 2ms
 ❯ api/tests/utils/productName.test.ts (0 test)
 ❯ api/tests/services/wholesalePrice.test.ts (0 test)
 ❯ api/tests/utils/money.test.ts (0 test)
 ❯ api/tests/validation/updateModulesSchema.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/looseSellTable.test.tsx (0 test)
 ❯ api/src/utils/__tests__/code128.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/printProductListMemo.test.tsx (0 test)
 ❯ api/tests/scripts/blisterBarcodeMigration.test.ts (0 test)
 ❯ api/tests/utils/serverTiming.test.ts (0 test)
 ❯ pullstok-front/src/__tests__/outsideBusinessHours.test.tsx (0 test)

 Test Files  206 failed | 14 passed (220)
      Tests  110 failed | 148 passed (258)
   Start at  11:46:16
   Duration  52.73s (import 56%, worker 23%, transform 13%, tests 8%, environment 1%)

    Isolate  220 workers spawned · ~391ms startup each (spawn + environment, per file)
             at least ~11.88s faster with isolate: false — reuses workers across files instead of one per file de printTicketDialog (14), useVendorCheckout.ticket (6) y
  unifiedPos.printTicket (9) → 29/29 verdes (RED previo: 13 fallas + import faltante);
  suite completa 771 ok / 8 fallas preexistentes (priceKgUpdate 6, productDrawer 2);
   limpio.
Próximo paso: revisión del usuario / push (decisión del usuario).
