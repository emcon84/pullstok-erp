# Venta de pastillas sueltas de un blister (FARMACIA)

## Objective
Permitir vender pastillas sueltas de un blister ya escaneado, sin precargar
`unitsPerBox` por producto (varía por laboratorio). El vendedor, al momento de
la venta, activa un switch "Vender pastillas sueltas" en el modal de escaneo
de UnifiedPos, carga cuántas pastillas trae ESE blister y cuántas vende; el
precio se deriva de esos dos números.

## Why
El feature de multi-pack existente (`unitsPerBox` persistido + `POR_UNIDAD`)
requiere cargar el conteo por producto de antemano. Para FARMACIA eso es
inviable (conteo varía por laboratorio/presentación, no vale la pena
mantenerlo si "no es tan común" cortar un blister). Se decidió con el owner
(conversación 2026-09-22) reutilizar el mismo cálculo de precio pero con el
conteo ad-hoc por venta, no persistido en el producto.

## Scope
- Nuevo `SaleMode` `POR_UNIDAD_BLISTER` (además de `BOLSA_CERRADA`,
  `POR_PESO`, `POR_MONTO`, `POR_UNIDAD` ya existentes).
- Nuevo campo `SaleItem.piecesPerBlister Int?` (auditoría: cuántas pastillas
  tenía ESE blister en ESA venta).
- Precio server-side = `computePerUnitPrice(catalogPrice, piecesPerBlister)`
  (mismo util `api/src/utils/unitsPerBox.ts`, ya redondea a $100 hacia
  arriba) × cantidad de pastillas vendidas.
- Stock: descuenta SIEMPRE 1 unidad entera de blister por línea (server
  ignora la cantidad de pastillas vendidas para el descuento de stock),
  igual que "abrir bolsa". Precisión de stock post-corte queda para conteo
  manual (precedente ya aceptado por el owner con POUCH).
- UI: switch "Vender pastillas sueltas" visible SOLO cuando
  `scanProduct.category?.name === "FARMACIA"` (asunción — confirmar con el
  owner si hace falta ampliar a otra categoría). Al activarlo aparecen 2
  inputs: "Pastillas por blister" (`piecesPerBlister`, entero > 1) y
  reutiliza el stepper de cantidad existente (`scanQty`) como "cantidad de
  pastillas a vender".
- Fuera de alcance: no tocar `POR_UNIDAD` (multipack existente de pouch), no
  tocar el switch global "Pouch por unidad" de VendorCatalogTab, no agregar
  UI en VendorCatalogTab (solo en el modal de escaneo de UnifiedPos).

## Constraints
- TDD estricto (config global): RED (test falla) → GREEN (mínimo código) →
  REFACTOR, por tarea. Runner backend: `npm test` en `api/` (jest). Runner
  frontend: `npm test` en `pullstok-front/` (`vitest run`).
- Server-authoritative: el precio NUNCA se confía del cliente (mismo patrón
  que `POR_UNIDAD` — el test `salesService.multipack.test.ts:150-189` prueba
  esto). `piecesPerBlister` SÍ se confía del cliente (es un dato físico del
  blister en mano, no un precio).
- Rama: crear `feature/venta-pastillas-sueltas-blister` (estamos en `main`).
- Cada tarea cierra con 1 commit de work-unit (Conventional Commits, sin
  Co-Authored-By, en inglés el código/mensaje).
- Presupuesto orientativo ~400 líneas por tarea (no es tope duro).

## Tasks
- [x] T1 — Backend schema + validación
      - Migración Prisma: `SaleMode` + valor `POR_UNIDAD_BLISTER`;
        `SaleItem.piecesPerBlister Int?`.
      - `api/src/validation/schemas.ts`: `saleProductSchema` — agregar
        `"POR_UNIDAD_BLISTER"` al enum de `saleMode`; nuevo campo
        `piecesPerBlister` (coerce int, requerido y > 1 SOLO cuando
        `saleMode === "POR_UNIDAD_BLISTER"`); requiere `productId` +
        `quantity` entero (igual que `POR_UNIDAD`/`BOLSA_CERRADA`).
      - Test primero: extender/crear test de validación (buscar el archivo
        de test de `schemas.ts` existente y seguir su estilo) cubriendo:
        acepta con piecesPerBlister válido; rechaza sin piecesPerBlister;
        rechaza piecesPerBlister <= 1; rechaza sin productId.
      - Archivo de mapeo (contexto ya extraído, no releer desde cero):
        `api/prisma/schema.prisma:742-778`, `api/src/validation/schemas.ts:256-297`.

- [x] T2 — Backend salesService
      - `api/src/services/salesService.ts`: nueva rama para
        `saleMode === "POR_UNIDAD_BLISTER"`, junto a la rama `POR_UNIDAD`
        existente (líneas ~256-291 del mapeo). Reglas:
        - Requiere `product` (igual que POR_UNIDAD).
        - `catalogPrice` = misma resolución mayorista que POR_UNIDAD.
        - `piecesPerBlister` viene del request (ya validado > 1 en T1), NO
          de `product.unitsPerBox`.
        - `linePrice = computePerUnitPrice(catalogPrice, piecesPerBlister)`.
        - Si `linePrice === null` → error explicativo.
        - `stockUnits = 1` SIEMPRE para esta rama (no `lineQuantity`).
        - Persistir `piecesPerBlister` en el `SaleItem` creado.
      - Test primero: nuevo archivo `api/tests/services/salesService.blisterUnit.test.ts`
        (seguir estilo de `salesService.multipack.test.ts:78-209`) cubriendo:
        precio recomputado server-side ignorando `price` del cliente; total
        = precio-por-pastilla × cantidad; stock descuenta exactamente 1 sin
        importar la cantidad de pastillas (probar con 1 y con 10); rechaza
        si falta `piecesPerBlister` o el producto no existe.

- [x] T3 — Frontend types + useVendorCart
      - `pullstok-front/src/types/index.ts`: agregar `"POR_UNIDAD_BLISTER"`
        al union type de `SaleMode`/equivalente; `piecesPerBlister?: number
        | null` donde corresponda (DataItem/CartItem — seguir el patrón de
        `unitsPerBox`/`perUnitPrice` ya presente).
      - `pullstok-front/src/components/hooks/useVendorCart.ts`: `addToCart`
        debe aceptar el nuevo modo + `piecesPerBlister`; cuando el modo es
        `POR_UNIDAD_BLISTER`, computar el precio de línea igual que hace hoy
        para `POR_UNIDAD` (línea ~101-102 del mapeo) pero derivando el precio
        con `computePerUnitPrice`-equivalente del lado front usando
        `piecesPerBlister` en vez de `product.unitsPerBox` (mirar si existe
        un helper front espejo de `api/src/utils/unitsPerBox.ts`; si no
        existe, replicar SOLO `computePerUnitPrice` — no duplicar todo el
        archivo, es la única función que hace falta).
      - Test primero: extender/crear `useVendorCart.blisterUnit.test.ts`
        siguiendo el estilo de `useVendorCart.multipack.test.ts`.

- [x] T4 — Frontend UnifiedPos modal
      - `pullstok-front/src/views/UnifiedPos.tsx`: en el modal de
        confirmación de bolsa cerrada (bloque ~435-559 del mapeo), agregar
        switch "Vender pastillas sueltas" visible solo si
        `scanProduct.category?.name === "FARMACIA"`. Al activarse: input
        numérico "Pastillas por blister" (`piecesPerBlister`, entero > 1);
        reusar el stepper de cantidad existente como cantidad de pastillas a
        vender. Mostrar precio unitario derivado en vivo (preview, mismo
        cálculo del util de T3) para que el vendedor vea el total antes de
        confirmar.
      - `handleConfirmScan` (línea ~204-232 del mapeo): cuando el switch está
        activo, llamar `cart.addToCart(..., "POR_UNIDAD_BLISTER",
        piecesPerBlister)` en vez de `"BOLSA_CERRADA"`.
      - Test primero: nuevo `unifiedPos.blisterUnit.test.tsx` (seguir estilo
        de `unifiedPos.openBag.test.tsx` / `unifiedPos.test.tsx` ya
        existentes).

- [x] T5 — Frontend checkout payload
      - `pullstok-front/src/components/hooks/useVendorCheckout.ts`
        (~líneas 46-75 del mapeo): rama para `POR_UNIDAD_BLISTER` análoga a
        la de `POR_UNIDAD`, incluyendo `piecesPerBlister` en el `CartItem`
        armado.
      - `useSales.ts` (createSale mutation, ~líneas 14-46 del mapeo):
        reenviar `piecesPerBlister` en el payload de `products[]` cuando el
        modo sea `POR_UNIDAD_BLISTER` (el server lo exige, ver T1).
      - Test primero: extender `useVendorCheckout.multipack.test.tsx` (o
        nuevo `useVendorCheckout.blisterUnit.test.tsx`) verificando el
        payload final incluye `piecesPerBlister` y el precio correcto.

- [x] T6 — Cierre
      - Correr suite completa backend (`npm test` en `api/`) y frontend
        (`npm test` en `pullstok-front/`) — todo verde.
      - Actualizar este archivo (checkboxes + evidencia de commits) y el
        espejo en Engram.
      - Reportar líneas totales agregadas/borradas (para decidir estrategia
        de entrega si supera ~400).

## Resolved TDD mode
Estricto, ON (config global del usuario). Runners: `api/` → `npm test`
(jest). `pullstok-front/` → `npm test` (`vitest run`).

## Progress / evidence

Rama: `feature/venta-pastillas-sueltas-blister` (creada desde `main`).

Commits (uno por tarea, RED→GREEN confirmado corriendo el runner real antes
de cada implementación):
- T1 `2ce1f01` — feat(api): add POR_UNIDAD_BLISTER sale mode schema + validation
- T2 `c9192a7` — feat(api): recompute blister-unit line price server-side in salesService
- T3 `aa8392d` — feat(front): add POR_UNIDAD_BLISTER mode to the vendor cart
- T4 `e40d0d0` — feat(front): add loose-blister-pieces switch to the scan confirmation modal
- T5 `422b493` — feat(front): forward piecesPerBlister through checkout to the sale payload

Todas DONE, test real corrido y en verde (RED confirmado antes de cada
implementación, ver detalle abajo). Ninguna quedó PARTIAL/BLOCKED.

### T6 — verificación final (ambas suites completas)

- Backend (`api/`, `npm test`, jest): **18 suites / 135 tests fallando —
  TODOS pre-existentes y ajenos a esta feature** (17 son `tests/e2e/*`, que
  requieren Postgres y por convención del proyecto SOLO corren en el VPS —
  no hay DB local; el restante es `tests/services/botService.test.ts`,
  módulo de chat/IA no tocado por este cambio). Confirmado comparando
  contra un baseline corrido ANTES de tocar código: mismo set exacto de 18
  archivos fallando, mismos 135 tests. Lo nuevo: +9 tests en verde
  (4 en `schemas.test.ts`, 5 en `salesService.blisterUnit.test.ts`).
- Frontend (`pullstok-front/`, `npm test`, vitest run): **2 archivos / 8
  tests fallando — TODOS pre-existentes y ajenos** (`priceKgUpdate.test.tsx`,
  `productDrawer.test.tsx`). Mismo baseline-diff: mismos 2 archivos, mismos
  8 tests, antes y después. Lo nuevo: +14 tests en verde repartidos en los 4
  archivos nuevos (`useVendorCart.blisterUnit`, `unifiedPos.blisterUnit`,
  `useVendorCheckout.blisterUnit`, `useSales.blisterUnit`).
- `npx tsc -b --noEmit` (front) y `npx tsc --noEmit` (api, src) limpios tras
  el cambio (se ajustaron dos `Record<SaleMode,string>` no relacionados —
  `PriceKgProductPanel.tsx`/`QuantityModal.tsx` — que TS marcó como no
  exhaustivos al agregar el nuevo modo al union type).

### Líneas totales (rama vs `main`)

`git diff main --stat` (solo `api/` + `pullstok-front/`): **18 archivos,
1100 inserciones(+), 21 borrados(-)** ≈ 1121 líneas autoría totales en la
rama completa (T1-T5). Bastante por encima del heurístico de ~400/tarea
agregado, mayormente por tests (los 4 archivos de test frontend nuevos +
el de `salesService.blisterUnit.test.ts` sacan ~780 líneas del total). El
usuario decide si conviene partir en PRs encadenadas antes de mergear.

### Decisiones de diseño no especificadas exactamente por el task file

1. **Merge key del carrito**: `useVendorCart.addToCart` ahora funde líneas
   por `productId + saleMode + loosePriceId + piecesPerBlister` (antes no
   incluía `piecesPerBlister`). Dos escaneos del mismo producto con distinto
   conteo de pastillas por blister quedan como líneas SEPARADAS (cada una
   solo puede llevar un `piecesPerBlister`, ya que es 1:1 con `SaleItem`).
2. **Ubicación de los tipos (T3)**: el task file menciona
   `pullstok-front/src/types/index.ts` para el union de `SaleMode` +
   `piecesPerBlister`, pero ese archivo (`DataItem`) nunca tuvo un campo
   `SaleMode` — es metadata de catálogo, no de línea de venta. Se agregó
   `POR_UNIDAD_BLISTER`/`piecesPerBlister` en los DOS lugares reales donde
   vive el resto del feature POR_UNIDAD: el `SaleMode`/`VendorCartItem`
   propios de `useVendorCart.ts` (T3) y el `SaleMode`/`CartItem`/
   `SaleRequest` de `models/salesModel.ts` (T5, consumido por
   `useVendorCheckout`/`useSales`). `types/index.ts` no se tocó.
3. **Nombre exacto del input**: "Pastillas por blister"
   (`id="pieces-per-blister-input"`), switch `id="sell-loose-blister"` con
   label "Vender pastillas sueltas" — nombres no dados literalmente por el
   task file, elegidos por consistencia con el resto del modal.
4. **Migración**: `20260922120000_add_blister_unit_sale` (aditiva,
   `ALTER TYPE ... ADD VALUE` + `ALTER TABLE ... ADD COLUMN`), mismo patrón
   exacto que `20260831000000_multipack_units_per_box`. No se corrió
   `prisma migrate dev` (no hay DB local); se regeneró el client con
   `npx prisma generate` para que TS/tests vean los tipos nuevos. Falta
   aplicar la migración real en el VPS antes de deployar.
