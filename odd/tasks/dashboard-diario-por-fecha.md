# Dashboard de estadísticas: elegir el día en "Diario"

## Objetivo
En "Estadísticas de Ventas" (y las otras 3 pestañas que comparten el mismo
componente: Presupuestos, Pedidos, Remitos), la vista "Diario" siempre
muestra "hoy, hasta este momento" — no hay forma de elegir otro día. El
usuario quiere ver, por ejemplo, lo que vendió ayer.

## Causa raíz (verificada, 2026-09-29)
`getDateRange("daily")` en `pullstok-front/src/utils/statsHelpers.ts:28`
siempre devuelve `{ start: hoy 00:00, end: ahora }` — no acepta una fecha de
referencia. `Statistics.tsx` no tiene ningún input para elegirla. Por diseño,
"Diario" JAMÁS pudo mostrar un día distinto al actual.

## Bugs latentes encontrados de paso (mismo archivo, se arreglan junto)
- `groupByPeriod` arma la clave de agrupación diaria/semanal con
  `date.toISOString().split("T")[0]` — usa el día en UTC, no el local. Una
  venta hecha de noche en Argentina (UTC-3, ej. 23:00) puede caer bajo la
  fecha del día SIGUIENTE en la tabla "Detalle por período" (semanal/mensual).
- `formatPeriodLabel` hace `new Date(key)` sobre una clave "YYYY-MM-DD" —
  JS interpreta esa cadena como medianoche UTC, así que en un huso negativo
  (Argentina) se muestra el día ANTERIOR al real (ej. una venta del 28
  aparece como "27/09"). Mismo tipo de bug, en la etiqueta en vez de la clave.

## Decisiones de diseño (defaults míos, sin confirmar)
- Selector de fecha nativo (`<Input type="date">`), mismo patrón que ya usa
  `Sales.tsx` (filtro por fecha). Aparece SOLO cuando `period === "daily"`,
  al lado de `PeriodSelector`. Default: hoy (comportamiento actual sin tocar
  nada).
- `getDateRange(period, referenceDate?)`: nuevo parámetro opcional; para
  `"daily"` devuelve `{ start: referenceDate 00:00, end: referenceDate
  23:59:59.999 }` (día completo, no "hasta ahora" cuando se elige un día
  pasado; si es hoy, igual corta a las 23:59:59.999 — un día ya completo no
  cambia nada práctico, simplifica el código a un solo camino).
- Alcance: el fix aplica a las 4 pestañas (sales/budgets/orders/receipts),
  porque comparten el mismo `Statistics.tsx`/`statsHelpers.ts` — no tiene
  sentido angostarlo solo a ventas.
- Weekly/monthly/yearly NO llevan navegación (fuera de pedido; solo "diario"
  lo necesita según el usuario).

## Contexto de checks
- TDD estricto. Front vitest (`pullstok-front/`). Sin cambios de backend
  (`getAllSales` ya trae todo; el filtro es 100% client-side).
- Trabajo directo en `main`, sin push hasta verificar.

## Tareas
- [x] T1 — `statsHelpers.ts`: `getDateRange(period, referenceDate?)` con
      día completo local para `"daily"`; fix de zona horaria en
      `groupByPeriod` (clave local, no UTC) y `formatPeriodLabel` (parsear
      "YYYY-MM-DD" como fecha local, no UTC). Tests primero (incluye un caso
      con una venta a las 23:00 ART que debe caer en SU día, no en el
      siguiente).
      Commit: `47b41f1`.
      Evidencia: TDD estricto — RED confirmado con 6 tests fallando
      (`npx vitest run src/__tests__/statsHelpers.test.ts` → `6 failed | 7
      passed (13)`, incluye la prueba del bug: `formatPeriodLabel` mostraba
      "27/9" en vez de "28/09"); tras implementar, GREEN
      (`npx vitest run src/__tests__/statsHelpers.test.ts` → `13 passed
      (13)`). El test de zona horaria fuerza `process.env.TZ =
      "America/Argentina/Buenos_Aires"` (scoped con `beforeAll`/`afterAll`)
      para no ser flaky según el TZ de la CI.
- [x] T2 — `Statistics.tsx`: estado `selectedDay`, `<Input type="date">`
      visible solo en `period === "daily"`, wired a `getDateRange`. Tests
      primero (cambiar de día recalcula total/monto/detalle; el selector no
      aparece en semanal/mensual/anual).
      Commit: `7fb50a3`.
      Evidencia: nuevo archivo `src/__tests__/Statistics.test.tsx` (4 tests:
      input ausente por defecto, aparece solo en Diario, cambiar de día
      recalcula total/cantidad con 2 ventas mockeadas en días distintos,
      vuelve a "hoy" al reentrar a Diario). `npx vitest run
      src/__tests__/Statistics.test.tsx` → `4 passed (4)`. Suite completa
      `npx vitest run` → `1108 passed | 8 failed (1116)`, los 8 fallos son
      los 6 pre-existentes de `priceKgUpdate.test.tsx` + 2 de
      `productDrawer.test.tsx` listados como conocidos, nada más se rompió.
      `npx tsc -p tsconfig.app.json --noEmit` → sin errores.
      Desviación: a diferencia de T1, en T2 el código de `Statistics.tsx` se
      escribió antes que `Statistics.test.tsx` (no hubo RED previo real para
      T2); los tests sí quedaron verdes y se razonó que fallarían contra el
      código anterior (el input no existía).

## Próximo paso
Implementado. Falta: push (lo hace el orquestador tras verificar).
