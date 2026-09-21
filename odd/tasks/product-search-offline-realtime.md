# Buscador de productos del admin: catálogo offline + sync por socket

## Objetivo
El buscador de "abrir bolsa" en `LooseStockAdmin` (`/stock-suelto`) anda lento en
mobile porque pide `pageSize=300` en un único request server-side por cada
búsqueda. El scanner (`StockScannerPage`) ya resuelve esto con un snapshot
completo del catálogo en IndexedDB + búsqueda 100% en memoria
(`pullstok-front/src/lib/offlineCatalog.ts`), pero ese snapshot solo se
refresca por TTL (3 min) al montar la vista o al reconectar — sin push.

## Por qué
Decisión del usuario (conversación 2026-09-21): llevar `LooseStockAdmin` al
mismo patrón de catálogo offline que el scanner, y además cerrar el gap de
staleness emitiendo un evento por socket.io cuando un producto se
crea/actualiza/borra, para que el snapshot se actualice en vivo en vez de
esperar el TTL.

## Alcance
- Backend: evento `product:changed` (señal `{ productId, action }`, mismo
  patrón que `emitOrdersChanged`) emitido a `orgRoom(organizationId)` desde
  create/update/delete de producto. Endpoint `GET /products/:id/offline-snapshot`
  para que el cliente resuelva un producto individual en la forma `OfflineProduct`
  (reusa el mapeo de `getOfflineSnapshot`, extraído a helper compartido).
- Frontend: `offlineCatalog.ts` gana patch puntual (`patchProduct`,
  `removeProductFromCatalog`, `fetchAndPatchProduct`) sin tocar el TTL de
  resync completo. Hook `useProductCatalogRealtime` (patrón
  `useChatConversationsRealtime`) montado a nivel de layout autenticado.
  `LooseStockAdmin` deja de pegarle a `products()` con `pageSize=300` y pasa a
  usar `ensureOfflineCatalog()` + `searchProducts()` local, igual que el
  scanner.
- Fuera de alcance: tocar `VendorCatalogTab`/`useVendorCatalog` (ya es
  razonablemente rápido con infinite scroll) y cualquier otro buscador admin
  no mencionado.
- **Diferido (decisión 2026-09-21):** el fix de raíz del costo de
  `findCellForProduct` en `getOfflineSnapshot` (~3.6s de los 3.9s totales,
  ver memoria `offline-first/erp-mobile`) y en `getProductByCode` — cachear
  `priceKgLista` por producto con invalidación multi-tenant. Requiere mapear
  también dónde se edita la planilla de precio/kg (marcas/tipos/celdas) para
  no dejar la cache stale. Usuario decidió posponerlo y avisó que amerita
  Opus para el diseño de invalidación — se retoma después de T1-T5.

## Restricciones / contexto
- Multi-tenant: todo emit y query debe respetar `organizationId`
  (`requireOrganizationId()` / extensión anti-fuga de Prisma).
- El operador ya se une automáticamente a `orgRoom(organizationId)` al
  conectar el socket (`api/src/realtime/socket.ts:375`) — no hace falta join
  explícito desde el frontend.
- Sin Docker/BD local: tests backend (jest) corren sin DB; e2e solo en VPS.
- Preservar el fallback: `handleSearch` actual busca "el catálogo completo"
  porque productos fuera del pageSize inicial deben encontrarse igual — el
  catálogo offline YA cubre esto (snapshot completo local), no se pierde
  funcionalidad.

## TDD
Modo: **estricto** (flag de sesión). Fuente: system-level "Strict TDD Mode:
enabled". Runners: backend `jest` (`api/package.json` → `test`), frontend
`vitest run` (`pullstok-front/package.json` → `test`). RED observado antes de
implementar, luego GREEN, luego REFACTOR — por tarea.

## Tareas

- [ ] **T1 — Backend: endpoint de snapshot individual**
  - Extraer el mapeo por-producto de `getOfflineSnapshot`
    (`api/src/controllers/productController.ts:1092`) a un helper reusable.
  - Nuevo handler `getOfflineProductSnapshot` (`GET /products/:id/offline-snapshot`)
    devolviendo un único producto en forma `OfflineProduct`.
  - Ruta: `api/src/routes/productRoutes.ts` (verificar que no choque con la
    ruta genérica `/products/:id` existente).
  - Test jest primero (RED): 404 si no existe / no es de la org, shape
    correcto si existe.
  - Ruta: delegado (writer backend, toca controller + routes + test = 3 archivos).

- [ ] **T2 — Backend: emitir `product:changed` en create/update/delete**
  - `emitProductChanged(organizationId, productId, action)` en
    `api/src/realtime/socket.ts`, mismo patrón que `emitOrdersChanged` (línea 446).
  - Wire-up en `createProduct` (línea 43), `updateProduct` (línea 834),
    `deleteProduct` (línea 962) de `productController.ts`, después del commit
    exitoso.
  - Test jest primero (RED): mockear el emitter y verificar que se llama con
    action correcta tras cada mutación exitosa (y que NO se llama si la
    mutación falla).
  - Ruta: delegado (mismo writer que T1, secuencial — T1 y T2 tocan los mismos
    archivos backend).

- [ ] **T3 — Frontend: patch puntual del catálogo offline**
  - `offlineCatalog.ts`: `patchProduct(product: OfflineProduct)`,
    `removeProductFromCatalog(id: string)` (upsert/delete en IndexedDB +
    reindexar Maps en memoria, sin tocar `lastSync`/TTL de resync completo).
  - `fetchAndPatchProduct(id: string)`: pega a `GET /products/:id/offline-snapshot`
    y llama `patchProduct`.
  - Test vitest primero (RED) para cada función nueva.
  - Ruta: delegado (writer frontend infra).

- [ ] **T4 — Frontend: hook de realtime + montaje global**
  - `useProductCatalogRealtime` (patrón `useChatConversationsRealtime`,
    `pullstok-front/src/components/hooks/useChatRealtime.ts:72`): suscribe a
    `product:changed` vía `getSocket(token)`; `deleted` → `removeProductFromCatalog`,
    si no → `fetchAndPatchProduct`.
  - Montar el hook a nivel de layout autenticado (para que corra sin importar
    qué vista esté abierta), no solo dentro de `StockScannerPage`.
  - Test vitest primero (RED): evento simulado → función de catálogo llamada
    con los argumentos correctos.
  - Ruta: delegado (mismo writer que T3, secuencial).

- [ ] **T5 — Frontend: rewire de `LooseStockAdmin`**
  - Reemplazar `handleSearch` (línea 168, hoy `products(undefined, term, undefined, 1, 300)`)
    por `ensureOfflineCatalog()` (al abrir el diálogo) + `searchProducts()` local,
    igual que `StockScannerPage`.
  - Confirmar el campo id real en `ProductsProps` (`id` vs `_id`) antes de
    mapear `OfflineProduct` → lo que usa el JSX (solo `id`/`_id` + `name`
    según el mapeo previo).
  - Actualizar/crear test vitest para `LooseStockAdmin` (RED primero): la
    búsqueda ya no dispara request server-side por keystroke, usa el catálogo
    local.
  - Ruta: delegado (writer frontend, depende de T3 completo).

## Progreso
(se completa a medida que cada tarea cierra, con evidencia de checks y commit)
