# Informe de ventas: gráficos por categoría y productos más vendidos

## Objetivo
En "Estadísticas de Ventas" (`Statistics.tsx`, type "sales") agregar dos gráficos que respeten el
período elegido: (1) ventas por categoría y (2) top 10 productos más vendidos. Ranking por MONTO ($).

## Decisiones (usuario, 2026-09-30)
- "Más vendido" se mide por MONTO ($), no por cantidad (la cantidad mezcla bolsas, kg sueltos y unidades).
  La cantidad puede mostrarse en el tooltip/tabla.

## Hechos verificados
- `Statistics.tsx` ya tiene selector de período, `StatsChart` (recharts ^3.7), export PDF/Excel y usa
  `useGetSales()` (trae TODAS las ventas; filtra por fecha en el cliente con `filterByDateRange`).
- Renglón de venta (`salesModel.ts` Sale.items): `name, quantity, price, category (string), productId,
  saleMode, loosePriceId`. `category` = nombre de la categoría del producto al vender
  (`api/src/services/salesService.ts:466`, fallback "Sin categoría"). Líneas sueltas: productId null.
- Suelto POR_PESO/POR_MONTO: quantity puede ser kg → el monto se calcula como en el resto de los totales
  (el writer debe verificar cómo se calcula el total de un renglón antes de sumar).

## Decisiones de diseño (defaults míos, sin confirmar)
- Agregación en el front sobre las ventas ya cargadas y filtradas por el período (funciones puras en
  `utils/statsHelpers.ts` o módulo propio). Endpoint de agregación en servidor queda para después
  (rendimiento: `getSales` trae todo el historial).
- Monto por renglón coherente con los totales existentes; sin restar descuentos/recargos a nivel venta
  (se aclara en la UI: "antes de descuentos" si corresponde).
- Producto = agrupar por `productId`; si es línea suelta, por `loosePriceId`; si no, por nombre.
- Categoría vacía → "Sin categoría". Categorías: top 8 + "Otras" (agrupa el resto).
- Forma: barras horizontales ordenadas por monto, una sola serie/un solo color (magnitud), según el skill
  dataviz: marcas finas, extremos redondeados, tooltip al hover, etiquetas selectivas, vista de tabla
  accesible, modo oscuro. Solo aparece para type "sales" (no en presupuestos/pedidos/remitos).
- Sin cambios de backend ni de exportación PDF/Excel en esta versión.

## Contexto de checks
- TDD: estricto (config de sesión "Strict TDD Mode: enabled"). RED → GREEN → REFACTOR observados.
- Runner front: vitest (`pullstok-front/`, `npx vitest run <archivo>`); `npx tsc -p tsconfig.app.json --noEmit`
  limpio; 8 fallos preexistentes (priceKgUpdate x6, productDrawer x2). No hay backend/BD local: la
  verificación visual real la hace el usuario tras el deploy.
- Heurística ~400 líneas/tarea; forecast ~450. Entrega: commits en `feat/sales-report-charts`;
  merge/push a `main` cuando el usuario lo pida (así despliega).

## Tareas
- [x] T1 — Helpers puros de agregación (por categoría con "Otras", top N productos) + tests primero.
      Ruta: delegada (writer front).
- [x] T2 — Componentes de gráfico (barras horizontales, tooltip, tabla accesible) + integración en
      `Statistics.tsx` para type "sales" + tests. Ruta: delegada (mismo writer).

## Progreso
- Rama `feat/sales-report-charts` creada desde `main` (`f9d1f3f`). Exploración hecha.

- T1 (c3cae70): `utils/salesAggregations.ts`; monto por renglón = round2(quantity × price) (misma fórmula
  que el total de línea del server; POR_MONTO guarda kg = monto ÷ precio). 17 tests RED→GREEN. Ruta: delegada.
- T2: `molecules/RankedBarChart`, `utils/truncateLabel.ts`, integración en `Statistics.tsx` (solo sales).
  Tests: rankedBarChart (6), Statistics.rankings (4) RED→GREEN. tsc/eslint limpios; vitest completo: solo los
  8 fallos preexistentes. Sin verificación visual en navegador (sin backend/BD). Ruta: delegada.

## Próximo paso
Revisión y verificación visual del usuario tras deploy.
