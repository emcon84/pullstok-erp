# Admin: abrir producto al escanear con la pistola

## Objetivo
En el perfil ADMIN (Dashboard con tabla de productos), escanear con la pistola
abre un modal del producto (como el del vendedor en UnifiedPos), con un botón
"Editar" que abre el `ProductDrawer` existente para editarlo.

## Por qué
El vendedor ya tiene el modal de escaneo (`UnifiedPos.tsx`, `handleScan` →
`GET /products/by-scan/:barcode`). El admin hoy escanea y no pasa nada.

## Alcance / restricciones
- Solo front. El endpoint `by-scan` ya sirve a cualquier usuario autenticado.
- NO tocar el flujo del vendedor (`branchMode.kind === "single"` → UnifiedPos).
  El capturador del admin debe estar deshabilitado para ese caso.
- Etiqueta de balanza (`isScale`): el admin no edita celdas sueltas → toast informativo, sin modal.
- Reusar el patrón del capturador de ráfaga de UnifiedPos (≥6 chars alfanuméricos + Enter,
  gap >400ms resetea, <60ms previene escritura en el input enfocado). No capturar si hay
  un drawer/modal con inputs abierto.
- Strict TDD (vitest, `pullstok-front`, corre local sin DB): RED → GREEN → REFACTOR.

## Tareas
- [x] T1 Hook `useScanCapture` (extraer/replicar el listener de ráfaga, con `enabled`) + tests
- [x] T2 Modal `ScannedProductDialog` (admin): nombre, imagen, códigos, precio, stock, botón Editar/Cerrar + tests
- [x] T3 Integrar en `Dashboard.tsx` (fetch by-scan, abrir modal, Editar → `ProductDrawer`) + test (incl. modo ADMINISTRATIVO y estadísticas)

## Criterios de aceptación
- Admin escanea código válido → modal con el producto; "Editar" cierra el modal y abre ProductDrawer con ese producto.
- Código inexistente → toast "Producto no encontrado".
- Vendedor/cajero: comportamiento intacto.

## Progreso
Route: delegated direct. TDD: on, vitest (`pnpm vitest run <files>`).
Reimplementado sobre la base nueva (HEAD bff091b, modo ADMINISTRATIVO); referencia descartada: `backup/discarded-admin-scan` (76e0e27).

### Cambios respecto a la versión descartada
- `showsPos = single && !isAdminMode`: en modo ADMINISTRATIVO un usuario de una sola sucursal ve el listado (no el POS), así que el capturador queda habilitado ahí; sigue deshabilitado solo cuando se renderiza UnifiedPos.
- Capturador también deshabilitado mientras se muestra la vista de estadísticas (`selectedStat`).
- `/` (AdminHome) no monta el listado; el listado de productos/ProductDrawer del admin vive solo en `Dashboard` (`/` OPERATIVO y `/stock` ADMINISTRATIVO), ambos cubiertos.

### Evidencia
- RED observado: `dashboard.scan.test.tsx` 7 fallos / 3 pasan antes de integrar en Dashboard -> GREEN 10/10.
- `useScanCapture.test.tsx` + `scannedProductDialog.test.tsx` + `dashboard.scan.test.tsx`: 23 tests OK.
- dashboard* + unifiedPos* + vendorDashboard* + scan nuevos: 12 files / 103 tests OK.
- `pnpm tsc --noEmit -p tsconfig.app.json`: limpio.
