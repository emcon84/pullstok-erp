# Carga manual de productos en el POS del vendedor

## Objetivo
Cuando el vendedor arma un pedido de venta y no encuentra el producto, puede
cargarlo a mano (nombre + precio) y se agrega al pedido. Esos productos quedan
guardados en una categoría especial ("Carga manual") y el admin los ve en una
lista desde la UI para darles "Agregar al sistema" (pasarlos a producto real).

## Decisiones (confirmadas con el usuario)
- El producto manual es un `Product` REAL (los `OrderItem`/`SaleItem` mantienen
  su FK) con `isManual = true`, creado en la categoría "Carga manual" de la org.
- Los productos manuales NO validan ni descuentan stock en `createSale`
  (decisión del usuario, 2026-09-25). Al promoverlos se les carga stock normal.
- Un solo flag (`isManual`): true = pendiente de revisión. Promover = `isManual=false`
  + categoría real elegida. Sin segundo flag "review pending" (redundante).
- Fuera de alcance (pedido aparte del usuario, "vamos de a una cosa"): que el
  vendedor pueda crear productos reales/promover. Se decide después.

## Hechos verificados
- `Product.categoryId` es nullable; `Category` unique = `[organizationId, parentId, name]`
  (parentId null → Postgres no lo deduplica: hacer findFirst + create, como los scripts).
- Stock en `api/src/services/salesService.ts`: rama sucursal (`else if (sellerBranchId)`,
  ~L374) y rama legacy/admin (~L405) validan y descuentan. La rama suelta (~L344)
  no aplica (los manuales solo se venden BOLSA_CERRADA).
- Precio BOLSA_CERRADA es server-authoritative desde `product.price` → el precio
  tipeado se guarda en el Product.
- El carrito (`CartItemRow`) topea el `+` con `item.stock` → los manuales no deben topearse.
- Órdenes PENDING no validan stock; la conversión orden→venta pasa por `createSale`.
- `publishedToStore` default false → no sale en la tienda pública; igual se filtra por `isManual`.

## Contexto de checks
- TDD: estricto (Strict TDD Mode habilitado en la config del usuario/sesión).
- Runner backend: jest (`npm test` en `api/`, unit sin DB; e2e solo en VPS).
- Runner frontend: vitest (`npm test` en `pullstok-front/`).
- Migraciones: las aplica el pipeline (GitHub Actions) — NO correr manual.
- Estimación: ~450 líneas autorales (heurística, no tope). Estrategia de entrega: ask-on-risk.

## Tareas
- [x] T1 — API: `Product.isManual` (schema + migración) y `createSale` saltea
      validación/descuento de stock para productos manuales (ramas sucursal y
      legacy). Auditar caminos que devuelven stock (anular venta, etc.). Tests primero.
- [x] T2 — API: servicio+endpoint `POST /products/manual` (roles ADMIN, MANAGEMENT,
      VENDEDOR, CASHIER; crea/reusa categoría "Carga manual", `isManual=true`,
      `quantity=0`, `publishedToStore=false`), `GET /products/manual` (lista
      admin) y `POST /products/:id/promote` (categoría real + `isManual=false`).
      Zod, multi-tenant, tests.
- [x] T3 — Front: dialog "Producto manual" en `UnifiedPos` (nombre + precio +
      cantidad) → `POST /products/manual` → línea al carrito; el carrito no topea
      líneas manuales por stock. Tests primero.
- [x] T4 — Front: vista admin "Carga manual" (lista + acción "Agregar al sistema"
      con categoría, reusando el modal/drawer de edición), ruta + sidebar.

## Ruteo por tarea
(se completa al implementar: inline/delegado + evidencia del trigger)
- T1: delegated writer (2+ non-trivial files)
- T2: delegated writer (2+ non-trivial files)
- T3: delegated writer (2+ non-trivial files)
- T4: delegated writer (2+ non-trivial files)

## Progreso / evidencia
- Rama: `feat/manual-products-pos`.
- T1 (RED→GREEN): tests nuevos en `api/tests/services/salesService.test.ts`. RED
  observado: 4 fallaron (manual sucursal sin ProductStock, manual legacy qty 0,
  deleteSale sucursal y legacy reponían stock de manuales); 2 de regresión
  (no-manual sin stock sigue lanzando) pasaban. GREEN: `npx jest
  tests/services/salesService.test.ts` 34/34; `npm test` → solo fallan suites
  `tests/e2e/*` (requieren Postgres, solo VPS) y `botService.test.ts`, que pasa
  12/12 aislada (flaky bajo carga); `npx tsc --noEmit` → 3 errores preexistentes,
  todos en `tests/e2e/` (business-hours, loose-sale), ninguno en archivos de T1.
- T1 auditoría de reposición de stock: único camino que repone stock por ítems de
  venta = `salesService.deleteSale` (increment en LooseStock / ProductStock /
  Product) → ahora saltea productos `isManual`. `looseSaleService.openBag` es
  apertura de bolsa (no ligado a ventas); no hay cancelación de pedido con stock
  (las órdenes PENDING no validan ni descuentan stock).
- Migración `20260925120000_add_product_is_manual` escrita a mano, NO aplicada
  (la aplica el pipeline).

- T2 (RED→GREEN): tests nuevos `tests/services/manualProductService.test.ts`,
  `tests/controllers/manualProductController.test.ts`,
  `tests/validation/manualProductSchemas.test.ts`,
  `tests/controllers/productController.publishManual.test.ts`,
  `tests/routes/manualProductRoutes.test.ts` + 2 casos en `storeController.test.ts`.
  RED: 6 suites fallaban (módulos inexistentes + 5 asserts de `isManual`/rutas);
  GREEN: esas 6 suites 37/37; `npm test` → solo fallan `tests/e2e/*` (Postgres, solo
  VPS) y `botService.test.ts` (pasa 12/12 aislada); `npx tsc --noEmit` → los 3
  errores preexistentes de `tests/e2e/` (business-hours L35/L38, loose-sale L186).
- T2 diseño: `manualProductService` (crea/reusa categoría raíz "Carga manual" con
  findFirst+create; nombre con `normalizeProductName` = MAYÚSCULAS, convención del
  negocio) + `manualProductController` + rutas antes de `/:id`. Roles: POST /manual
  ADMIN/MANAGEMENT/VENDEDOR/CASHIER; GET /manual y POST /:id/promote ADMIN/MANAGEMENT.
  Tienda pública: `isManual: false` en getProducts, getProductById y checkout;
  `publishProduct(true)` y `bulkPublish(true)` excluyen manuales. Sin test de rol
  a nivel unit (los guards solo se prueban en e2e/VPS, no hay patrón unit).
  Los checkout de tienda solo se cubren por e2e (tx SERIALIZABLE, no unit-testable).

- T3 (RED→GREEN): tests nuevos `manualProductService.test.tsx` (servicio + hook),
  `manualProductDialog.test.tsx`, `manualProductCart.test.tsx`,
  `unifiedPos.manualProduct.test.tsx` + 2 casos en `useVendorRowsKeyboard.test.ts`.
  RED: 13 tests fallaban + 2 suites sin módulo (`ManualProductDialog`,
  `useCreateManualProduct`); GREEN: esas 5 suites 40/40. `npm test` (vitest) →
  942 pasan / 8 fallan, TODOS preexistentes (`priceKgUpdate.test.tsx` x6,
  `productDrawer.test.tsx` x2; fallan igual con los cambios stasheados).
  `npx tsc -b` → 0 errores; eslint sobre archivos nuevos → limpio (los errores
  de lint que quedan en archivos tocados son preexistentes: `any` en
  `types/index.ts` y `UnifiedPos.tsx` catch, warnings de hooks en VendorCatalogTab).
- T3 diseño: botón "Producto manual" (junto a "Abrir bolsa", ambas pestañas, sin
  atajo de teclado) abre `ManualProductDialog` (Nombre, Precio es-AR, Cantidad);
  `useCreateManualProduct` (mutation, invalida `["products"]`) → al éxito
  `cart.addToCart(..., stock 0, "BOLSA_CERRADA")` con `isManual`. Guards: el
  capturador de la pistola se apaga con el diálogo abierto; `/` dentro de un
  diálogo ya no roba el foco al buscador (`useVendorRowsKeyboard`); al cerrar el
  foco vuelve al listado (`onClosed=exitToGrid`).
- T3 gates de stock salteados para `isManual`: `CartItemRow` (+), `VendorCatalogTab`
  (`commit`, `maxSellable`, `enabled`), `ProductTable` (badge "Manual" en vez de
  "Sin stock"). Sin tocar: `useVendorCheckout` (manda stock 0, el server saltea),
  legacy `VendorDashboard`/`QuantityModal` (no ruteado).
- Hallazgo preexistente (NO corregido): `VendorCatalogTab` pasa `disabled: enabled`
  a `inlineQty` — semántica invertida (filas CON stock quedan con input/+ deshabilitados,
  sin stock habilitados). Fix de una línea: `disabled: (i) => !enabled(i)`; queda
  pendiente de decisión del usuario por su impacto en el foco del teclado.

- T4 (RED→GREEN): tests nuevos `manualProductsAdminService.test.tsx` (servicio +
  hooks), `promoteManualProductDialog.test.tsx` (diálogo + picker + helper),
  `manualProductsView.test.tsx`, `manualProductsNav.test.ts`. RED: las 4 suites
  fallaban (módulos inexistentes / entrada de nav y ruta ausentes). GREEN: esas 4
  suites 30/30. `npm test` (vitest) → solo fallan los 8 preexistentes
  (`priceKgUpdate.test.tsx` x6, `productDrawer.test.tsx` x2); `npx tsc -b` → 0
  errores; eslint `--max-warnings 0` sobre archivos nuevos → limpio.
- T4 diseño: ruta lazy `/carga-manual` (vista `ManualProducts`), entrada "Carga
  manual" en el grupo Productos justo tras Categorías (`visibleRoles` ADMIN/MANAGEMENT
  + `ROLE_VISIBLE_PATHS`); guard client-side en la vista (`getMe` + `roleAllows`,
  redirige a /dashboard). Servicio `getManualProducts`/`promoteManualProduct` en
  `productService.ts`; hooks `useManualProducts` (key `["manual-products"]`, sin
  refetch al enfocar) y `usePromoteManualProduct` (invalida `["manual-products"]` y
  `["products"]`). Diálogo `PromoteManualProductDialog` reusa `CategoryTreePicker`
  con la nueva prop `excludeRootNames` (helper `omitRootsByName`, solo raíces) para
  ocultar "Carga manual". Filas memoizadas. NO se reusó el ProductDrawer: editar
  nombre/precio antes de promover quedó fuera (el drawer completo trae variantes,
  stock por sucursal, etc.; no es trivialmente reutilizable) y no hay edición de stock.

## Próximo paso
Verificación final + merge a main y push (autorizado por el usuario).
