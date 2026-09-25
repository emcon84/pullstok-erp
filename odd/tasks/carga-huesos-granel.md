# Carga de la lista "huesos a granel" (lista sep 2026.xlsx)

## Objetivo
Cargar en la org "El Almacén de las Mascotas" (prod) los productos de la planilla
`C:\Users\Emiliano\Downloads\lista sep 2026.xlsx` ("Lista de precios de huesos a
granel": huesos, rolls, donuts, orejas, palitos, etc.), con el mismo patrón que la
carga de accesorios (`odd/tasks/carga-accesorios-listas.md`): dataset versionado +
loader dry-run / `--apply`, idempotente, sin borrar ni pisar nada.

## Decisiones (usuario, 2026-09-25)
- Autorizó mirar las categorías del VPS (hecho, solo lectura) y "cargar todo lo que
  puedas, lo demás lo hago a mano".
- Categoría destino: `PERROS > SNACKS, PREMIOS Y GOLOSINAS`
  (id prod `7a4a3778-1e1d-4759-88cc-69b19683d5ee`, org `1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b`;
  56 productos existentes, sin huesos a granel; ya tiene variantes Marca/Sabor/Formato,
  que NO se completan en esta carga).
- Precio = columna `precioxunidad` tal cual (mismo criterio que accesorios; no se
  agrega IVA). `Bolsa x uni` (unidades por bolsa) NO se guarda: no se setea
  `unitsPerBox` porque el precio de la planilla ya es por unidad.
- Nombre = celda `Descripcion` con trim, normalizado con `normalizeProductName`
  (mayúsculas, espacios colapsados), como el resto del catálogo.
- No se cargan (se listan en el dry-run): filas sin nombre, filas con precio 0 o vacío,
  y las notas de envío/pago del pie de la planilla.
- Se crean con `quantity=0`, `carried=false`, `publishedToStore=false` (como accesorios).
  Stock inicial / carried se decide aparte con el usuario.
- Idempotente: omite nombres que ya existan en la org (case-insensitive).

## Hechos verificados
- Hoja única "Hoja1"; datos en filas 4-62 (Excel), col A nombre, B bolsa x uni, D precio.
- Hay filas con precio y sin nombre (ej. col D=1170 sin nombre entre "Roll 4/5" y
  "Roll 6/7"): el usuario no las ubica → se omiten y se listan.
- La librería `xlsx` NO está en el proyecto; para leer la planilla se instaló en el
  scratchpad de la sesión (no se agrega dependencia al repo).
- Precedente de ejecución en el VPS: `ts-node --transpile-only` dentro de
  `/var/www/pullstok/api` (script copiado ahí); backup `pg_dump` antes del `--apply`.

## Tareas
- [x] T1 — Dataset `api/scripts/data/huesos-granel.ts` (extraído de la planilla,
      versionado) + `planLoad` puro con tests (TDD): trim/normalización, omisión de
      sin-nombre / precio<=0 / duplicados por nombre, listado de omitidos.
- [x] T2 — Loader `api/scripts/load-huesos-granel.ts` (dry-run por defecto, `--apply`,
      resuelve la categoría por id/nombre, `createMany`).
- [x] T3 — Dry-run en el VPS y revisión (conteos y omitidos).
- [x] T4 — Backup `pg_dump` + `--apply` en el VPS + verificación de conteos e
      idempotencia (dry-run posterior: 0 a crear).

## Autorización y checks
- Lectura del VPS autorizada. Escritura en prod: el usuario pidió cargar todo; el
  `--apply` se hace tras el dry-run y con backup previo.
- TDD estricto ON. Runner API (desde `api/`): jest, `npm test` (unit sin DB).
- Ruta: T1-T2 delegated writer (2+ archivos no triviales); T3-T4 inline (ejecución remota).

## Progreso
- Rama: `feat/carga-huesos-granel`. Categorías de prod leídas (solo lectura).
- T1+T2 hechos (writer, local): dataset `api/scripts/data/huesos-granel.ts` (49 filas extraídas por script; re-parse idéntico), `planLoad` puro, loader `api/scripts/load-huesos-granel.ts`. TDD: RED observado (módulo inexistente) -> GREEN `npm test -- huesos-granel` 14/14. `npx tsc --noEmit`: solo los 3 errores preexistentes en tests/e2e. Plan local con org vacía: 36 a crear, 13 omitidos (9 sin precio: 7 huesos corbata 16/17-18/19 y 20/21-23/24, Roll 9/10, Donuts 6,5; 4 sin nombre: filas 26/29/31/47).

- T3 (2026-09-25, inline): loader + dataset copiados por scp a `/var/www/pullstok/api/scripts/`;
  dry-run en el VPS: dataset 49 | a crear 36 | ya existen 0 | omitidos 13 (idéntico al plan local).
- T4 (2026-09-25, inline): backup `/root/pre-huesos-granel_20260925_134538.sql.gz` (gzip -t OK,
  1,1 MB). `--apply`: 36 productos creados. Dry-run posterior: a crear 0 | ya existen 36
  (idempotente). Categoría PERROS > SNACKS, PREMIOS Y GOLOSINAS; quantity 0, carried=false,
  publishedToStore=false.
- Pendiente a mano (usuario): 9 filas sin precio (huesos corbata 16/17-18/19 y 20/21-23/24,
  Roll 9/10, Donuts 6,5) y 4 filas sin nombre (Excel 26, 29, 31, 47).

## Próximo paso
Definir con el usuario stock inicial / carried (como en accesorios T5/T6) y si se mergea
la rama (loader + dataset versionados).
