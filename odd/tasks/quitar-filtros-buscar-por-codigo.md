# Quitar chips de filtros rápidos + buscar por código tipeado

## Objetivo
A) Desmontar las filas de chips (categorías, "Títulos" de planilla, variantes/Marca) del admin y del vendedor.
B) Si la pistola falla, tipear el código (barcode) en el buscador y encontrar el producto.

## Por qué
El usuario nunca usa los chips; cuestan requests (facets) y render. El código tipeado debe funcionar como fallback del lector.

## Alcance / restricciones
- Quedan: búsqueda por texto, "Solo lo que trabajo", filtro por proveedor, selector Tipo SECO/WET de ALICAN, "Limpiar filtros" del estado vacío del vendedor.
- TDD on (vitest front, jest api). UI en español.

## Tareas
- [x] T1 API: `buildProductSearchWhere` busca también por `barcode` (contains, insensitive) + test (RED observado: 1 fallo -> GREEN 20/20; se actualizaron los conteos de OR 4->5 de los tests existentes).
- [x] T2 Front admin: `productHaystack` incluye `barcode` + 4 tests (RED observado: 3 fallos -> GREEN 23/23). El payload de `GET /products` ya incluye `barcode` (escalar vía `include`, solo `variantAssignments` tiene `select` anidado; ver product-list-payload-perf).
- [x] T3 Desmontar `<FilterChips>` en `Dashboard.tsx`, `VendorDashboard.tsx` y `VendorCatalogTab.tsx`; borrar `FilterChips` y su test (queda sin referencias).
- [x] T4 Quitar queries/estado muertos (ver abajo) y adaptar tests.

## Qué se quitó y qué se mantuvo
Quitado (quedó muerto sin los chips):
- `useProductFacets` en `Dashboard` y en `useVendorCatalog` (1 request `filter-facets` menos por pantalla; el vendedor además dejaba de refetchear al cambiar de categoría). El hook `useProductFacets`/`getProductFacets` sigue existiendo (lo prueban `useProducts.priceListType.test` y lo invalida `QuickPriceModal`); ya no lo consume ninguna pantalla.
- `Dashboard`: estado `categoryFilter` y `titleFilter` (solo los seteaban los chips), `filterVersion`/`setFilterFromOutside` (remonte del input por chips/"limpiar todo"), import `planTitleKeyOf`. "limpiar todo" (de la barra de filtros activos de los chips) desaparece con ellos; el input se vacía a mano.
- Vendor: handlers `handleFilterChange/CategoryChange/TitleChange/ClearFilters` y retorno `facets*` de `useVendorCatalog`.
Mantenido:
- `useVendorCatalog`: `categoryFilter`/`titleFilter` (alimentan `useInfiniteProducts`, `clearSearch`, el estado vacío y `storedFilter.categoryFilter` que restaura la navegación al scanner `?assignTo=`); solo se desmontó la UI.
- Selector de tipo ALICAN (SECO/WET) y `planType` -> `useProducts`; agrupación/impresión (`printGrouping`) intactas.
- Placeholders de búsqueda sin cambios.

## Evidencia
Ver commit (comandos y resultados en el reporte de la tarea).
