# Imprimir ticket desde el celular en la ticketera del local (relay por servidor)

## Objetivo
Que desde el celular (p. ej. tras una venta en el scanner/Vender) se pueda imprimir el ticket en la ticketera
térmica del local, sin depender del WiFi ni de que el celular esté en la misma red.

## Decisiones (usuario, 2026-09-30)
- Ir por la ticketera del local (relay por servidor). La impresora portátil Bluetooth queda fuera por ahora.
- IMPORTANTE: probablemente haya MÁS DE UNA ticketera (varios locales/sucursales y/o varias en un mismo local).
  El diseño debe contemplar múltiples impresoras desde el inicio.

- PC de caja apagada (usuario, 2026-09-30): el job espera en cola y se imprime al prender, pero vence a los
  15 minutos (estado EXPIRED + aviso al usuario); nunca se imprimen tickets viejos.

## Hechos verificados
- `print-agent/` (Windows, ESC/POS crudo) corre en la PC de caja y el front le habla por `localhost`
  (`directPrintAgent.ts`, `printTicketAgent.ts`). Desde un celular `localhost` es el propio celular: no sirve tal cual.
- Ver `odd/tasks/print-agent.md` (T5 pendiente: prueba real en la PC de caja + Release).

## Decisiones de diseño (defaults míos, sin confirmar)
- El celular envía el job al backend (bytes ESC/POS o datos de ticket + `printerId`); el agente de la PC de caja
  lo recibe (conexión saliente: WebSocket/long-polling, sin abrir puertos) y lo imprime.
- Modelo multi-impresora: cada impresora registrada tiene id, nombre ("Caja 1", "Depósito"), sucursal y agente dueño.
  Un agente puede exponer varias impresoras; puede haber varios agentes (uno por PC/local).
- Emparejamiento del agente con la organización (token por agente), multi-tenant (orgId) y cola de jobs con estado
  (pendiente/impreso/error) para reintento si la PC de caja está apagada.
- En el celular: selector de impresora (recuerda la última usada por sucursal) y botón "Imprimir" tras la venta.

## Preguntas abiertas (de a una, cuando se arranque)
- ¿La ticketera de cada local se asigna por sucursal o se elige al imprimir?
- ¿Qué pasa si la PC de caja está apagada: encolar y avisar, o solo avisar?

## Contexto de checks
- TDD estricto. Backend: unit tests locales sin BD; e2e solo en VPS. Front: vitest local.
- La impresión real no se puede probar sin la impresora: la valida el usuario en el local.

## Tareas
- Plan propuesto tras explorar (2026-09-30, sin confirmar). Decisiones de arquitectura:
  el CELULAR genera los bytes ESC/POS (el logo se rasteriza con canvas en el navegador; `encodeSaleTicketEscPos`
  es puro) y el backend solo los encola; el agente consulta por polling saliente (sin dependencias nuevas, sin
  abrir puertos); auth del agente con token propio por agente (guardar solo el hash), nunca con el JWT de usuario;
  el token NO va en la query string (header `Authorization`). Jobs con vencimiento corto para que no salgan
  tickets viejos al prender la PC.
- [x] T1 — Backend: modelos `Printer` + `PrintJob` (tenant-scoped, migración por pipeline), alta/listado de
      impresoras (ADMIN), emparejamiento de agente (token de un solo uso → agente recibe su token), tests primero.
- [x] T2 — Backend: crear job (VENDEDOR/CASHIER/ADMIN/MANAGEMENT, valida que la impresora sea de la org, tope de
      tamaño), endpoints del agente (pendientes, confirmar impreso/error, heartbeat), vencimiento, tests primero.
- [x] T3 — print-agent: emparejamiento + loop de polling con backoff, soporte de varias impresoras locales
      por agente, reporte de estado; tests primero (spooler inyectado).
- [x] T4 — Front: pantalla admin de impresoras (alta, emparejar, estado online) + en celular botón "Imprimir"
      con selector de impresora (recuerda la última por sucursal) y estado del job; tests primero.
  Bloqueado solo por orden: terminar `scanner-sell-mode` primero. El print-agent ya fue probado en la PC de
  caja (usuario, 2026-09-30): imprime bien.

## Evidencia T1/T2 (2026-09-30, backend, rama feat/print-relay)
- T1 commit `6723a8e` (modelos Printer/PrintAgent/PrintJob + migración `20260930120000_print_relay` + admin
  `/api/printers` + emparejamiento `POST /api/print-agent/pair`). T2 commit `9aef838` (`POST/GET /api/print-jobs`,
  agente `heartbeat` / `GET jobs` / `POST jobs/:id/result` con `authenticateAgent`).
- RED observado: jest falló con TS2307 "Cannot find module" (servicio, controllers, middleware) antes de implementar.
- GREEN: T1 26 tests + routes 7; T2 43 tests (agentAuth, printJobController, printAgentController, routes);
  `npx jest --testPathIgnorePatterns e2e` = 122 suites, 1779 passed, 2 skipped.
- `npx tsc --noEmit`: sin errores fuera de `tests/e2e/*` (3 errores previos, ajenos). `npx prisma validate` OK.
- Migración NO aplicada (no hay BD local): el SQL se contrastó contra `prisma migrate diff --from-empty --to-schema`
  (mismos índices y FKs). Falta aplicarla por el pipeline y probar e2e en el VPS.
- Ruta: delegated direct (un writer), trigger de escritura 2+ archivos.
- Decisiones: token del agente `<agentId>.<secreto>` (hash SHA-256 + timingSafeEqual); código de emparejamiento
  XXXXX-XXXXX (10 min, solo hash, índice único); `express.json` 512kb solo para `/api/print-jobs`.
- Pendiente conocido: sin estado "en proceso" el agente podría reimprimir si un poll ocurre antes de reportar
  (el agente debe reportar antes del siguiente poll).

## Evidencia T3/T4 (2026-09-30, rama feat/print-relay)
- T3 commit `0e9f949` (print-agent 1.1.0: `src/relay.ts`, `POST /pair`, `/health` con `paired`+`serverUrl`, config
  `serverUrl`/`agentId`/`agentToken`). RED: vitest falló (relay.test.ts sin módulo, config/server con 8 fallos);
  GREEN: `npx vitest run` en print-agent = 6 archivos, 61 tests; `npx tsc --noEmit` OK.
  Un test (no loguear el token) falló primero y llevó a agregar redacción en el log del relay.
- Deviación backend `490b7fb`: `GET /api/print-jobs/printers` (impresoras activas para VENDEDOR/CASHIER/ADMIN/
  MANAGEMENT). Sin esto el celular del vendedor no podía descubrir impresoras (`/api/printers` es solo ADMIN/MGMT).
  RED: jest (listActivePrinters inexistente + ruta ausente); GREEN: 45 suites print/controllers, 520 tests.
- T4a commit `c32ba94` (pantalla `/impresoras`, `PairThisPcDialog`, `pairAgent` en directPrintAgent, nav + permisos).
- T4b commit `e72a63b` (`utils/relayPrint.ts`, `useTicketPrint`, orden agente -> relay -> panel en
  `printSaleTicketViaAgent`, tarjeta "Imprimir ticket" en ScannerSellPanel, relay en UnifiedPos).
- Front: tests nuevos RED observados antes de implementar; suite completa `npx vitest run src/__tests__` =
  1215 passed, 8 failed (los 8 previos: priceKgUpdate x6, productDrawer x2). `npx tsc -p tsconfig.app.json
  --noEmit` limpio; eslint limpio en archivos tocados salvo 1 error previo `no-explicit-any` en UnifiedPos.tsx:295.
- Ruta: delegated direct (un writer).
- NO verificado: impresión real extremo a agente (PC de caja) y celular; migración no aplicada/e2e en VPS; .exe y
  Release sin construir (los hace el usuario); modo oscuro y táctil sin revisión visual; DirectPrintSettings no
  muestra aún el estado `paired`.

## Próximo paso
Aplicar la migración por el pipeline, e2e en el VPS, construir el .exe 1.1.0 y probar de punta a punta en el local.

## Cierre (2026-09-30)
- Verificado por el usuario en producción: imprime desde el celular en la térmica de la caja (relay OK).
- Agente 1.1.0 publicado (Release `print-agent-v1.1.0`); aviso de actualización en Ajustes (`8932eea`);
  errores del relay visibles en el celular en vez de caer al panel (`673e6c5`).
- Causa de la confusión: "Equipo" (PC con el agente, en línea) ≠ "Impresora" (entrada a crear con
  "Nueva impresora"). Sin impresora creada, el celular decía "no hay impresoras configuradas".

## Pendientes / mejoras
- Emparejar sin completar deja equipos huérfanos ("Caja" x3): reutilizar o limpiar los no emparejados.
- UX: tras emparejar un equipo, guiar o crear sola la impresora (hoy hay que ir a "Nueva impresora").
- Sin estado "en proceso" en los jobs: el agente debe reportar antes del siguiente poll.
- `DirectPrintSettings` no muestra el estado `paired` del agente.
