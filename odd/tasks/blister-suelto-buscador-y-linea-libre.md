# Blister suelto desde el buscador + línea libre por gramos

## Objetivo
1. El check "Vender pastillas sueltas" (hoy solo en el modal de escaneo de UnifiedPos,
   categoría FARMACIA) también aparece al agregar un blister buscándolo a mano (Enter en el buscador).
2. Vender un ítem ad-hoc (ej. hueso molido por gramos) SIN crear producto: nombre + gramos +
   precio TOTAL, queda como línea del pedido y de la venta, no se lista en ningún catálogo.

## Por qué
1. Escanear siempre es engorroso; hoy buscar+Enter agrega el blister entero.
2. El "Producto manual" actual crea un Product real (isManual) que queda listado en /carga-manual.

## Decisiones (confirmadas con el usuario)
- Línea libre: monto = precio TOTAL cargado a mano (opción A), no precio/kg.
- Sin producto persistido: `SaleItem.productId` ya es nullable (precedente: ventas sueltas por celda).
  Sin stock que descontar. Sin migración salvo que el backend la exija.

## Tareas
- [x] T1 Blister suelto desde el buscador (VendorCatalogTab): check + pastillas por blister, mismo contrato que el modal de escaneo
- [x] T2 Backend: aceptar línea libre (sin productId/loosePriceId) con nombre, cantidad (gramos) y precio total; validación Zod; totales/caja/pagos coherentes
- [x] T3 Front: UI "Venta libre" en UnifiedPos (nombre, gramos, precio total) que agrega la línea al carrito único
- [x] T4 Ticket/impresión y listados de venta muestran la línea libre correctamente

## Criterios de aceptación
- Buscar un blister FARMACIA + Enter → check de venta suelta disponible; confirmando se agrega POR_UNIDAD_BLISTER igual que al escanear.
- Línea libre: se agrega, se cobra, aparece en la venta y el ticket, y NO crea Product ni aparece en /carga-manual ni catálogo.
- Flujo de escaneo y "Producto manual" existentes intactos.

## Progreso
Route: delegated direct. TDD: on (vitest front local; jest api unit local; NO e2e local).

### T1 — evidencia
- Hallazgo: el flujo "buscador + Enter" y Enter/click en el input de cantidad de la fila pasan ambos por
  `commit()` de `VendorCatalogTab` (NO usa `useVendorQuantityModal`, que es del VendorDashboard viejo).
  Se interceptó ahí: si `isFarmaciaProduct(p)` (categoría FARMACIA, objeto o string) se abre
  `LooseBlisterDialog` (switch + pastillas por blister + cantidad + preview); con el switch apagado
  agrega igual que antes (BOLSA_CERRADA / updateQuantity), con el switch activo llama
  `addToCart(..., "POR_UNIDAD_BLISTER", undefined, undefined, undefined, sellsWholesale, piecesPerBlister)`.
- Compartido: `BlisterLooseFields` (switch + input) usado por el modal de escaneo y el nuevo diálogo;
  helpers `isFarmaciaProduct` / `isValidPiecesPerBlister` en `vendorCatalogHelpers`.
- Teclado: Enter en el input de cantidad confirma; el botón Agregar tiene autoFocus; el diálogo es un portal,
  así que `useVendorRowsKeyboard` queda mudo mientras está abierto.
- Trade-off: toda fila FARMACIA agrega ahora un paso (diálogo) al confirmar; Enter sobre "Agregar" lo resuelve.
- RED: vendorCatalogTab.blisterLoose.test.tsx 10 fallas -> GREEN 11/11; unifiedPos*, catalogMultipack,
  manualProductCart, vendorDashboard*, dashboard* verdes; tsc limpio.

### T2/T3/T4 - Venta libre: diseno y evidencia
- Discriminador: flag explicito en el request `freeLine: true` (NO persistido). `SaleItem.saleMode` es un enum
  Prisma (`SaleMode`), asi que un valor nuevo exigiria migracion: se evito. Persistencia sin migracion:
  renglon `POR_PESO` con `productId = null` y `loosePriceId = null` (mismo shape que un suelto cuya celda se borro),
  `category = "Venta libre"`.
- Unidad: `quantity` en KG (3 decimales = gramo), igual que POR_PESO. La UI carga/muestra gramos
  (`gramsToKg`, `formatFreeLineWeight`: "350 g" bajo 1 kg, "1,25 kg" desde 1000 g).
- Request: `{ freeLine: true, name, quantity (kg), lineTotal ($, <= 2 dec) }`; `price` se ignora (se normaliza a 0).
  Server: `price` persistido = lineTotal / quantity (snapshot por kg), total de la linea = round2(lineTotal) exacto;
  descuento %, recargo tarjeta y suma de pagos funcionan igual que el resto. Sin stock (no toca ProductStock /
  LooseStock / Product), sin sucursal obligatoria, NUNCA crea Product.
- Modelo de confianza: el monto lo declara el vendedor, igual que BOLSA_CERRADA/POR_PESO (price del cliente).
  El server valida forma (Zod + defensa en el service): nombre no vacio (<= 120), quantity > 0 (<= 3 dec),
  lineTotal > 0 (<= 2 dec), sin productId/loosePriceId. No hay catalogo contra el cual contrastar el monto.
- Front: `useVendorCart.addFreeLine` (id sintetico `free-<uuid>`, no se fusionan, inmutables salvo quitar;
  `totalAmount` suma `lineTotal`), `FreeLineDialog` + boton "Venta libre" junto a "Producto manual",
  `CartItemRow` sin stepper, ticket "350 g" con total exacto, listado de ventas con `quantityLabel` ("350 g").
- "Guardar pedido" (P) rechaza carritos con linea libre (un Order exige productId): hay que vender directo.
- No aparece en /carga-manual ni catalogos porque no existe Product (tests: no se llama createManualProduct ni
  tx.product.create).
- Facturacion desde la venta: el mapeo SaleItem -> InvoiceLine usa quantity x price (kg x $/kg), reproduce el total.
- Checks: api `npx jest --testPathIgnorePatterns e2e` 123/126 suites OK (fallan authService/authController/
  moduleController: pre-existentes, Prisma client sin `uiMode`); front `pnpm vitest run` 157/159 archivos OK
  (solo priceKgUpdate y productDrawer, pre-existentes); `tsc --noEmit -p tsconfig.app.json` limpio; api `tsc --noEmit`
  sin errores en archivos tocados (errores pre-existentes por Prisma client desactualizado).
- Pendiente (no hecho): CustomerAccountDialog muestra la linea libre como "0,35 kg" (no en gramos); migracion de
  enum no necesaria.
