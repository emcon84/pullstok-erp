# Impresión directa de tickets: agente local Windows (ESC/POS crudo)

## Objetivo
Imprimir el ticket de venta SIN el panel de impresión de Chrome y con texto nítido. Hoy el ticket se
arma como HTML y sale por el driver de Windows como imagen (borroso, ~17% más ancho que el CSS, panel
de Chrome). Un programa local recibe bytes ESC/POS del sistema y los manda CRUDOS (RAW) a la impresora
por el spooler de Windows (texto con la tipografía interna de la impresora). Fallback: panel de Chrome.

## Decisiones (usuario, 2026-09-29)
- "Si se puede escribir a medida, lo hacemos; yo instalo" (una vez por PC de caja).
- Botón de descarga del instalador en el sistema; se publica como asset de un GitHub Release
  (repo público `emcon84/pullstok-erp`): `releases/latest/download/PullstokPrint-Setup.exe`.
- Publicar el Release NO se hace sin pedir OK al usuario (acción de cara al exterior).

## Historial relevante
- 2026-09-24 (Engram #753): Web Serial + ESC/POS se abandonó: "sondeo OK" pero no salía papel; el puerto
  FTDI nunca se confirmó como la impresora. El fallo era el TRANSPORTE, no el generador de bytes.
- Impresora: OCOM 58mm, instalada con driver de Windows (impresión por spooler, no COM).

## Hechos verificados (mapper, 2026-09-29)
- `pullstok-front/src/utils/escpos.ts`: `encodeSaleTicketEscPos(ticket, {logo?, cut?, columns?})` →
  `Uint8Array`, texto ASCII (translitera acentos, sin code page), 32 cols por defecto, negrita/doble
  tamaño, feed/cut; raster solo para logo. Sin dependencia de Web Serial. `loadLogoRaster`/
  `prepareTicketLogoBitmap` (ticketLogo.ts) preparan el logo.
- Punto de integración: `UnifiedPos.tsx:167` `handlePrintTicket` → `printSaleTicket(ticket)`
  (único call site de UI; el otro es el fallback dentro de `printTicketDirect.ts`).
- Monorepo pnpm (`api`, `pullstok-front`, `pullstok-landing`, `pullstok-tienda`); Node >=20 (local v24),
  pnpm 11; front: vite + vitest 2 (jsdom); api: jest. Prod: `https://app.pullstok.com`.
- localStorage ya se usa para prefs (`pullstok-thermal-printer*`).
- Mixed content: `http://127.0.0.1` es "potencialmente confiable" → no se bloquea desde https
  (MDN/Chrome). El permiso "Local Network Access" puede pedir un "Permitir" una vez; el agente responde
  `Access-Control-Allow-Private-Network: true`. Se confirma en la PC real.

## Decisiones de diseño (defaults míos, sin confirmar)
- Nuevo paquete `print-agent/` (Node + TypeScript, sin dependencias de runtime: `node:http`), agregado
  a `pnpm-workspace.yaml`. Test con vitest.
- Escucha SOLO en `127.0.0.1:9123` (configurable). Endpoints: `GET /health` (`{name, version, printer}`),
  `GET /printers` (impresoras de Windows), `PUT /config` (`{printer}`), `POST /print` (body binario
  `application/octet-stream`, límite ~1 MB), `POST /test` (ticket de prueba).
- Seguridad: valida `Origin` en el servidor contra una lista (`https://app.pullstok.com`,
  `http://localhost:5173`, configurable) y responde CORS/preflight solo a esos orígenes. Sin token en v1.
- Impresión RAW: PowerShell hijo con `Add-Type` P/Invoke a `winspool.drv` (OpenPrinter/StartDocPrinter
  con datatype RAW/WritePrinter). Sin módulos nativos de Node. Solo Windows.
- Config en `%APPDATA%\PullstokPrint\config.json` (impresora elegida, puerto, orígenes).
- Empaquetado: `.exe` único (Node SEA o `@yao-pkg/pkg`) + instalador `PullstokPrint-Setup.exe` sin admin
  (copia a `%LOCALAPPDATA%`, arranque automático al iniciar sesión). Herramienta a elección del writer
  (Inno Setup si está, si no IExpress que viene con Windows); si no puede construir el .exe acá,
  entregar scripts + instrucciones y reportarlo como parcial. No firma digital (SmartScreen: OK).
- Front: `directPrintAgent.ts` (cliente HTTP), `UnifiedPos` intenta agente → si falla, `printSaleTicket`
  (panel de Chrome). Config de impresión directa en la UI de configuración: descargar instalador,
  detectar agente, elegir impresora, "Imprimir prueba". URL/estado del agente en localStorage.
- Sin QR ni features nuevas del ticket. Reimpresión y otras vistas (facturas, listas) fuera de alcance.

## Contexto de checks
- TDD: estricto (config de sesión "Strict TDD Mode: enabled"). RED → GREEN → REFACTOR observados.
- Runners: `print-agent` vitest; front vitest (`pullstok-front/`, `npx vitest run <archivo>`);
  `npx tsc -p tsconfig.app.json --noEmit` limpio en el front. 8 fallos preexistentes en front
  (priceKgUpdate x6, productDrawer x2).
- El agente y la impresión real NO se pueden probar acá sin la impresora: se prueba con un spooler
  inyectable en tests; la prueba real la hace el usuario en la PC de caja.
- Heurística ~400 líneas/tarea; forecast total ~900. Entrega: commits en `feat/print-agent`, sin PR;
  merge/push a `main` los decide el usuario (así despliega el front).

## Tareas
- [x] T1 — `print-agent/`: servidor HTTP (health, printers, config, print, test), validación de origen/CORS/PNA,
      spooler RAW por PowerShell (inyectable), config en disco. Tests primero. Ruta: delegada (writer 1). Commit `7ad714a`.
- [x] T2 — `print-agent/`: build a `.exe` + instalador (`PullstokPrint-Setup.exe`), autoarranque, README de
      instalación/publicación de Release. Ruta: delegada (mismo writer). Commit `e861e71`.
- [x] T3 — Front: cliente `directPrintAgent.ts` + `UnifiedPos` agente→fallback panel (bytes con
      `encodeSaleTicketEscPos` + logo). Tests primero. Ruta: delegada (writer 2). Commit `a4e96f4`.
- [x] T4 — Front: UI de configuración (descarga, detección, selector de impresora, prueba). Tests primero.
      Ruta: delegada (mismo writer 2). Commit `0c244b1`.
- [x] T5 — (prueba real OK y Release publicado, según el usuario, 2026-09-30) Prueba real en la PC de caja (usuario) + publicar Release (con OK del usuario).

## Progreso
- Rama `feat/print-agent` creada desde `main` (`8e9f9c2`). Mapeo hecho.
- T1 (`7ad714a`): RED = 4 archivos de test fallando por módulos inexistentes; GREEN = 5 archivos / 36 tests; `tsc --noEmit` limpio.
  Impresión real por winspool NO probada con papel (sin impresora RAW acá): verificado que el script PowerShell compila
  (Add-Type) y que OpenPrinter con un nombre inexistente devuelve error 1801 -> 502; `/printers` real lista 3 impresoras.
- T2 (`e861e71`): Node SEA + postject (exe 88.4 MB, GUI subsystem sin consola, firma de Node removida) e instalador IExpress
  (25.2 MB; Inno Setup no está instalado). Probado: el exe arranca y responde `/health`; el instalador (doble clic, sin UAC)
  instala en %LOCALAPPDATA%, crea Run key + entrada de desinstalación, arranca el agente; `uninstall.cmd` lo deja limpio.
  Ruta T1-T2: delegada (un writer). Mismo writer, tests primero.

- T3 (`a4e96f4`): RED = 3 archivos fallando por módulos inexistentes; GREEN = 45 tests en 4 archivos. Flag `pullstok-print-agent-enabled`:
  apagado => panel directo sin red. `printSaleTicketViaAgent` en `utils/printTicketAgent.ts`; se exportó `loadLogoRaster`.
  Toast `info` solo al caer al panel. `serialPrinter.ts`/`printTicketDirect.ts`/`PrinterConnectButton` intactos (ask-before-delete).
- T4 (`0c244b1`): RED = módulo `DirectPrintSettings` inexistente; GREEN = 7 tests. Sección en `/ajustes` (BrandingSettings), todos los roles.
  Full `vitest run`: solo los 8 fallos preexistentes; `tsc` limpio; eslint sin errores nuevos (2 `any` preexistentes).

## Próximo paso
T5 pendiente del usuario (prueba real en la caja + publicar Release con su OK).
