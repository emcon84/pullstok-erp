# Imprimir ticket desde el celular en la ticketera del local (relay por servidor)

## Objetivo
Que desde el celular (p. ej. tras una venta en el scanner/Vender) se pueda imprimir el ticket en la ticketera
térmica del local, sin depender del WiFi ni de que el celular esté en la misma red.

## Decisiones (usuario, 2026-09-30)
- Ir por la ticketera del local (relay por servidor). La impresora portátil Bluetooth queda fuera por ahora.
- IMPORTANTE: probablemente haya MÁS DE UNA ticketera (varios locales/sucursales y/o varias en un mismo local).
  El diseño debe contemplar múltiples impresoras desde el inicio.

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
- [ ] Por definir tras explorar (modelo de impresoras/jobs, canal agente↔servidor, UI celular).
  Bloqueado solo por orden: terminar `scanner-sell-mode` primero. El print-agent ya fue probado en la PC de
  caja (usuario, 2026-09-30): imprime bien.

## Próximo paso
Terminar `scanner-sell-mode`; luego explorar `print-agent/` y el backend para partir en tareas.
