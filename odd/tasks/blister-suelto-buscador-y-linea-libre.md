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
- [ ] T2 Backend: aceptar línea libre (sin productId/loosePriceId) con nombre, cantidad (gramos) y precio total; validación Zod; totales/caja/pagos coherentes
- [ ] T3 Front: UI "Venta libre" en UnifiedPos (nombre, gramos, precio total) que agrega la línea al carrito único
- [ ] T4 Ticket/impresión y listados de venta muestran la línea libre correctamente

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
