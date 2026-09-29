# Listado de productos: "Sin stock" incorrecto (vista sin sucursal)

## Objetivo
En el listado admin de productos (Dashboard, "todas las sucursales", sin
filtro de sucursal — el que usa `ProductsTable`), muchos productos muestran
"Sin stock" aunque tienen stock real en todas las sucursales (confirmado
abriendo el drawer de edición: 100 u. en cada una). El usuario confirma que
pasa en muchos productos, no en uno solo.

## Causa raíz (verificada, 2026-09-29)
- `GET /products` (`api/src/controllers/productController.ts` `getProducts`)
  solo incluye `stocks` (relación `ProductStock`) cuando viene `?branchId=`
  en el query (línea ~631: `...(branchId ? { stocks: {...} } : {})`). Sin
  sucursal seleccionada, la respuesta NO trae `stocks` en absoluto.
- Front: `unitStock`/`branchQty`
  (`pullstok-front/src/components/hooks/vendorCatalogHelpers.ts:94-111`) leen
  `p.stocks?.[0]?.quantity`; si es `undefined` (caso de arriba), caen al
  FALLBACK legacy: `Math.round(Product.quantity_kg / weightKg)`.
  `Product.quantity` es el campo viejo de antes de manejar stock por
  sucursal (`ProductStock`), y quedó en 0 (o desactualizado) para productos
  cuyo stock se cargó directo en `ProductStock` (scripts de carga masiva
  recientes: `fix-individual-stock.ts`, `set-accesorios-stock.ts`,
  `create-unit-products*.ts`, etc. — visibles en el working tree) sin pasar
  por el endpoint normal `PUT /products/:id/stock/:branchId`, que es el único
  que sincroniza `Product.quantity` (spec D4, comentario en
  `storeController.ts:80-82`).
- `ProductsTable` (`pullstok-front/src/components/molecules/ProductsTable/index.tsx:65-70`)
  ya documenta esto: "sin branchId la API NO adjunta stocks, así que se usa
  unitStock, que convierte products.quantity (kg legacy) a bolsas" — el
  fallback es esperado quedarse vacío, no un bug del front.
- El drawer de edición (`ProductDrawer` → `useProductStock` →
  `GET /products/:id/stock`) SIEMPRE lee `ProductStock` real por producto,
  por eso ahí se ve el número correcto — confirma que el dato real está bien,
  solo el listado global lo esconde.

## Decisión de diseño (mismo patrón ya usado en la tienda online)
- `readBranchStockMap` en `api/src/controllers/storeController.ts:52-64` ya
  resuelve exactamente este problema para el storefront público: una consulta
  aparte (`productStock.findMany`/agregada) en vez de depender del campo
  legacy. Replico el mismo patrón en `getProducts` (admin): cuando NO viene
  `branchId`, después de traer la página de productos, una sola consulta
  `productStock.groupBy({ by: ["productId"], _sum: { quantity: true } })`
  sobre los ids de esa página, y se adjunta `stocks: [{ quantity: suma }]` —
  MISMA forma que ya usa el front (`stocks[0].quantity`), así que
  `unitStock`/`branchQty`/`stockLabel` no cambian ni necesitan tocarse.
- Alcance: NO se toca el campo legacy `Product.quantity` ni se migran datos —
  el listado deja de depender de él, así que el bug desaparece para TODOS los
  productos afectados sin ningún backfill.
- Atención al costo: `odd/tasks/product-list-payload-perf.md` (T1-T4, ya
  cerrada) midió y recortó el payload de este mismo endpoint. La consulta
  agregada nueva es UNA sola query extra (no N+1) y agrega ~20 bytes/producto
  a la respuesta — no reabre esa tarea, pero se aplica con el mismo cuidado
  (nada de includes anidados nuevos).
- Confirmado que no afecta al POS del vendedor: `ProductsTable` solo se
  renderiza desde `Dashboard.tsx` en modo "todas las sucursales"
  (`branchMode=false`); en modo sucursal única (`UnifiedPos`) siempre viaja
  `branchId`, así que ese camino no cambia.

## Contexto de checks
- TDD estricto. Backend jest (`api/`, unit sin DB). Sin cambios de frontend
  necesarios (el front ya sabe leer `stocks[0].quantity`; solo se agrega un
  test de contrato si hace falta).
- Aplica a AMBAS ramas de `getProducts` (paginada y plana) por consistencia,
  aunque la paginada la usa el vendor dashboard que casi siempre manda
  `branchId`.
- Trabajo directo en `main`, push al terminar de verificar (patrón ya
  autorizado esta sesión).

## Tareas
- [x] T1 — `getProducts`: agregado real de `ProductStock` cuando no hay
      `branchId`, en las dos ramas (paginada y plana), mismo shape
      `stocks: [{ quantity }]`. Tests primero (producto sin stocks incluido
      hoy → aparece con la suma correcta; con `branchId` sigue devolviendo
      SOLO esa sucursal, sin cambios; performance: una sola query agregada,
      no N+1). Commit `541a1ba`.
      Evidencia: RED confirmado en
      `productController.stockAggregation.test.ts` (5 tests fallando antes
      de implementar, 2 ya en verde por no requerir el fix). Tras implementar:
      `npx jest tests/controllers/productController.stockAggregation.test.ts`
      → 7/7 PASS; `npx jest --testPathIgnorePatterns "tests/e2e"` → 113
      suites, 1669 passed, 2 skipped (pre-existentes), 0 failed; `npx tsc
      --noEmit` → solo los 3 errores pre-existentes en `tests/e2e/`
      (business-hours, loose-sale), nada en `src/`.

## Próximo paso
Cerrado. Sin trabajo pendiente para esta tarea.
