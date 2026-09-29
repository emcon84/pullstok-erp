# Carga de ropa para mascotas (3 fotos, Downloads\ropa)

## Objetivo
Cargar en prod los productos de ropa para mascotas fotografiados en
`C:\Users\Emiliano\Downloads\ropa` (3 fotos, listas de precios por talle),
en las categorías de "El Almacen de las Mascotas", con stock ficticio de 50u
en Casa Central — mismo patrón que `carga-accesorios-listas` (2026-09-25).

## Hechos verificados (2026-09-29)
- Org confirmada: `El Almacen de las Mascotas` (slug `el-almacen-de-las-mascotas`,
  id `1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b` — el mismo `DEFAULT_ORG` de todos
  los scripts previos).
- Categoría destino (vacía, 0 productos hoy):
  `INDUMENTARIA Y SEGURIDAD > CAPAS, CHAQUETAS, BUZOS Y ABRIGOS`
  (id `67d098d2-5dc2-4986-a915-bd61b5fd8417`). Tiene un variant "Talle"
  YA configurado con valores `CHICO/MEDIANO/GRANDE/EXTRA GRANDE` — NO sirve
  para las fotos (talles numéricos por proveedor, escalas distintas entre
  sí). Se decide NO usar el sistema de variantes: el talle va en el NOMBRE
  del producto, igual que hizo `accesorios-listas.ts` con las medidas.
- Categoría para accesorios sueltos (moño, bandanas):
  `INDUMENTARIA Y SEGURIDAD > ACCESORIOS DE INDUMENTARIA (PAÑUELOS, BOTITAS)`
  (id `544c6a03-88fe-448a-b1d3-21aef02b7cd7`).
- Verificado vía `report-category-tree.ts` (SSH, solo lectura).

## Transcripción de las 3 fotos (hecha por el orquestador, leyendo las imágenes
## directamente — no releer las fotos, usar este dataset tal cual)

Formato de nombre: `<BASE> TALLE <N> <MARCA?>` (talle omitido si no aplica,
marca omitida si la lista no la menciona) — mismo criterio que accesorios.

### Foto 1 (sin marca) → CAPAS, CHAQUETAS, BUZOS Y ABRIGOS
- **POLERA** — talle 20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100 →
  precio 7000,7500,7800,8000,8300,8800,9500,10500,11500,12000,15500,16800,
  18800,19500,21000,23000,24000 (17 filas)
- **BUZO POLAR** — talle 20,25,30,35,40,45,50,55,60,65,70,75 →
  7750,8000,8500,8800,9350,9600,10000,10850,12000,12900,15350,16750 (12)
- **MANTA CON CORDERITO** — talle 30,35,40,45,50,55,60,65,70,75,80 →
  3900,5500,5700,6300,9300,9800,10900,11300,12100,15100,19800 (11) — **VERIFY**:
  puede ser una prenda o una manta de cama; se carga como prenda por estar en
  la misma lista que buzos/poleras (misma foto, sin separación).
- **BUZO FRISA** — talle 20,25,30,35,40,45,50,55,60,65,70,75 →
  8350,8600,9100,9400,9900,10800,12200,12900,13600,14200,16900,18600 (12)

### Foto 2
- **LECHE Y MIEL** (marca) — talle 0..12, dos telas con precio propio:
  - **POLAR LISO** — talle 0,1,2,3,4,5,6,7,8,9,10,11,12 →
    3500,3700,4000,4600,5300,6300,7000,9000,9400,10300,12400,12700,13000 (13)
  - **POLAR SOFT** — talle 1,2,3,4,5,6,7,8,9,10,11,12 (talle 0 sin precio
    en la foto, se omite) → 4700,5200,6000,6800,8000,9000,12000,13000,14300,
    15000,15500,16000 (12)
  - **VERIFY**: la foto trae también "cm" por talle (27,30,34,39,42,45,52,56,
    61,68,72,78,83); se usa el número de talle, no el cm, para el nombre —
    igual criterio que el resto.
- **ROPA JAMIRO** (marca) — talle N25,N30,N35,N40,N45,N50,N55,N60,N65,N70,N75,
  N88(xxxl) → precio 3400,4000,4500,5300,6200,7000,8000,9000,10000,11000,
  12000,13000 (12 filas). **Cambio de alcance (autorizado por el usuario,
  2026-09-29): SÍ se carga**, con base genérica `ROPA` (la foto no dice qué
  prenda es — el dueño la va a renombrar a mano después según la prenda
  real). Nombre resultante: `ROPA TALLE N25 JAMIRO`, etc.
- **LAS CHIQUIS** (marca) — talle 30,35,40,45,50,55,60,65,70,75 → precio
  8000,8800,9500,10000,10500,11000,11500,12500,13000,14000 (10 filas).
  Mismo cambio de alcance: **SÍ se carga**, base genérica `ROPA`. Nombre
  resultante: `ROPA TALLE 30 LAS CHIQUIS`, etc.

### Foto 3 — "Buen Abrigo" (marca)
- **VESTIDO** — talle 0..7 → 7500,8300,9000,9500,10500,11300,12000,12800 (8)
- **JEANS Y POLAR** — talle 0..7 → 10500,11300,12000,12800,13500,14300,15000,
  15800 (8). **PENDING, NO CARGAR** los talles 8/9/10 (manuscritos, formato
  distinto "$17.500" vs el resto "$17,500" impreso — verificar si son precios
  reales o un borrador).
- **CON CAPUCHA** — talle 0..7 → 9000,9800,10500,11300,12000,12800,13500,
  14300 (8)
- **SIN CAPUCHA** — talle 0..10 → 6000,6800,7500,8300,9000,9800,10500,11300,
  12000,12800,13500 (11)
- Sueltos (van a ACCESORIOS DE INDUMENTARIA, sin talle): **MOÑO** $3800,
  **BANDANA CHICA** $3000, **BANDANA GRANDE** $4500 (marca BUEN ABRIGO)

**Total a cargar**: 17+12+11+12+13+12+12+10+8+8+8+11+3 = 137 productos.
(Nota: la suma original de esta lista, sin Ropa Jamiro/Las Chiquis, da 115 —
no 125 como se había escrito primero; fue un error de suma al redactar este
doc, no una fila de menos. Verificado sumando cada bloque de arriba y
confirmado por `CATALOG.length` en el test. Con Ropa Jamiro (+12) y Las
Chiquis (+10) cargados: 115+12+10 = 137.)
**Total PENDING (no se cargan)**: 3 (Jeans y Polar T8-T10, únicos que siguen
pendientes tras el cambio de alcance de abajo).

## Decisiones de diseño (defaults míos, sin confirmar)
- Mismo patrón de `accesorios-listas.ts`: dataset puro con tests
  (`GROUPS`/`expandGroups`/`validateCatalog`/`planLoad`/`planStock`),
  loader idempotente (omite productos que ya existen por nombre,
  case-insensitive), `quantity: 0` / sin stock al crear, `publishedToStore:
  false`, `carried` configurable por flag (default true, como el resto).
- Stock ficticio: script separado (mismo patrón `set-accesorios-stock.ts`),
  50u en Casa Central, solo a productos de ESTE dataset que hoy no tienen
  stock (nunca pisa un conteo real).
- Sin sistema de variantes (Talle) — el talle va en el nombre, como en la
  carga de accesorios. Si el negocio después quiere filtrar por talle en la
  tienda, es un fast-follow aparte (fuera de alcance).

## Contexto de checks
- TDD estricto. Backend jest (`api/`, unit sin DB) para el dataset (pure
  functions) — el loader/stock-setter en sí solo corren contra la BD real
  del VPS (no local), con `--dry-run` primero, SIEMPRE revisado a mano antes
  de `--apply`.
- Nunca correr `--apply` sin que el usuario vea el resumen del dry-run
  primero (mismo criterio que accesorios: reporta PENDING/VERIFY, decide
  con el dueño).

## Tareas
- [x] T1 — `api/scripts/data/ropa-listas.ts`: dataset (GROUPS de arriba,
      CATEGORY_PATHS con las 2 rutas confirmadas) + helpers puros
      (mirror exacto de `accesorios-listas.ts`) + test
      `api/tests/scripts/ropa-listas.unit.test.ts` (mirror del test de
      accesorios). RED→GREEN.
      Evidencia: commit `dd1ec33`. RED confirmado (`npx jest
      tests/scripts/ropa-listas.unit.test.ts` → módulo `./data/ropa-listas`
      inexistente, 0 tests corridos, TS2307). GREEN tras crear el dataset:
      22/22 tests pasando, incluyendo el sanity-check estructural
      `CATALOG.length === 137` y `PENDING.length === 3` (ver nota de la
      corrección de suma arriba).
- [x] T2 — `api/scripts/load-ropa-mascotas.ts` (mirror de
      `load-accesorios-listas.ts`) + `api/scripts/set-ropa-mascotas-stock.ts`
      (mirror de `set-accesorios-stock.ts`, default 50u). Sin tests propios
      (igual que los scripts hermanos, son I/O contra Postgres — la lógica
      pura ya la cubre T1).
      Evidencia: commit `dd1ec33`. No se corrieron (son I/O contra Postgres
      real, fuera de alcance de T1-T2). Suite completa verificada:
      `npx jest --testPathIgnorePatterns "tests/e2e"` → 114 suites / 1691
      tests pasando, 2 skipped. `npx tsc --noEmit` → solo los 3 errores
      pre-existentes conocidos en `api/tests/e2e/` (business-hours.e2e,
      loose-sale.e2e), ninguno introducido por este trabajo.
- [ ] T3 — Correr `load-ropa-mascotas.ts` en modo dry-run en el VPS (SSH,
      solo lectura), mostrar el resumen al usuario (a crear por categoría,
      PENDING, VERIFY) ANTES de pedir autorización para `--apply`.
- [ ] T4 — Con autorización: `--apply` del loader, luego dry-run y `--apply`
      del script de stock (50u Casa Central).

## Próximo paso
T1-T2 completadas (commit `dd1ec33`). Sigue T3: dry-run de
`load-ropa-mascotas.ts` en el VPS (SSH, solo lectura), mostrar el resumen
al usuario (a crear por categoría, PENDING, VERIFY) ANTES de pedir
autorización para `--apply` (T4).
