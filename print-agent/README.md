# Pullstok Print (agente de impresión)

Programa pequeño para Windows que corre en la PC de caja y recibe desde el sistema (navegador) los bytes ESC/POS del ticket. Los envía **crudos (RAW)** a la impresora térmica por el spooler de Windows: el texto sale con la tipografía interna de la impresora (nítido) y sin el panel de impresión de Chrome.

- Escucha **solo en `127.0.0.1:9123`** (nunca en la red).
- Solo acepta pedidos de los orígenes permitidos (`https://app.pullstok.com` y `http://localhost:5173` por defecto).
- Sin dependencias en tiempo de ejecución: un único `PullstokPrintAgent.exe` (Node SEA).

## Instalar en una PC de caja

1. Descargá el instalador: <https://github.com/emcon84/pullstok-erp/releases/latest/download/PullstokPrint-Setup.exe>
2. Ejecutá `PullstokPrint-Setup.exe`. No pide permisos de administrador.
3. Si Windows muestra **SmartScreen** ("Windows protegió su PC"): clic en **Más información** y luego **Ejecutar de todas formas** (el instalador no está firmado digitalmente).
4. Al terminar aparece el mensaje "Pullstok Print se instaló y ya está funcionando". Aceptalo.

Qué hace el instalador: copia el agente a `%LOCALAPPDATA%\PullstokPrint\`, lo registra para iniciar solo al iniciar sesión en Windows (sin ventana), lo arranca en el momento y agrega una entrada en "Aplicaciones instaladas" para desinstalarlo.

## Verificar que funciona

Abrí en el navegador de esa PC: <http://127.0.0.1:9123/health>

Debe mostrar algo como:

```json
{"name":"pullstok-print-agent","version":"1.1.0","printer":null,"platform":"win32","paired":false,"serverUrl":"https://app.pullstok.com/api"}
```

`printer: null` es normal hasta elegir la impresora desde la configuración del sistema. Para ver las impresoras detectadas: <http://127.0.0.1:9123/printers>.

## Desinstalar

- Configuración de Windows > Aplicaciones > **Pullstok Print (agente de impresion)** > Desinstalar; o
- ejecutar `%LOCALAPPDATA%\PullstokPrint\uninstall.cmd`.

Detiene el agente, quita el inicio automático y borra la carpeta de instalación. La configuración (`%APPDATA%\PullstokPrint\config.json` y `agent.log`) se conserva; borrala a mano si querés limpiar todo.

## Problemas frecuentes

- **SmartScreen bloquea el instalador**: ver el paso 3 de la instalación.
- **La impresora no aparece en la lista**: instalala primero en Windows (Configuración > Impresoras y escáneres), verificá que aparezca en <http://127.0.0.1:9123/printers> y volvé a elegirla en el sistema. El nombre debe coincidir exactamente con el de Windows.
- **Puerto 9123 en uso**: otro programa usa ese puerto. Cerralo, o cambiá `port` en `%APPDATA%\PullstokPrint\config.json` y reiniciá sesión de Windows (el sistema debe usar el mismo puerto). El detalle queda en `%APPDATA%\PullstokPrint\agent.log`.
- **`/health` no responde**: reiniciá el agente ejecutando `%LOCALAPPDATA%\PullstokPrint\PullstokPrintAgent.exe`, o reinstalá.
- **Imprime pero el sistema dice error / 403**: el sistema se abre desde un origen que no está permitido. Agregalo en `allowedOrigins` de `config.json`.
- **Error 502 al imprimir**: la impresora está apagada, sin papel o desconectada; revisá el spooler de Windows.

## Configuración (`%APPDATA%\PullstokPrint\config.json`)

```json
{ "printer": "OCOM 58", "port": 9123, "allowedOrigins": ["https://app.pullstok.com", "http://localhost:5173"], "serverUrl": "https://app.pullstok.com/api", "agentId": null, "agentToken": null }
```

Variables de entorno opcionales: `PULLSTOK_PRINT_CONFIG` (ruta del config), `PULLSTOK_PRINT_PORT`.

## API local

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/health` | `{ name, version, printer, platform }` |
| GET | `/printers` | `{ printers: string[] }` |
| PUT | `/config` | Body `{ "printer": "..." }`; valida que exista y lo guarda |
| POST | `/print` | Body binario `application/octet-stream` (máx. 1 MB); 409 sin impresora, 502 si falla el spooler |
| POST | `/test` | Imprime un ticket de prueba |
| POST | `/pair` | Body `{ "code": "XXXXX-XXXXX" }`; canjea el código de emparejamiento en el servidor y guarda las credenciales (nunca las devuelve) |

## Impresión desde el celular (relay por servidor)

Una vez emparejado, el agente se conecta **hacia afuera** al servidor (sin abrir puertos): envía un latido cada ~30 s con las impresoras de Windows detectadas y consulta trabajos cada ~3 s. Cada trabajo se imprime en la impresora de Windows asignada (`localName`) y el resultado (PRINTED/ERROR) se informa antes del siguiente pedido, para no imprimir dos veces. Ante errores de red reintenta con espera de 1 s hasta 30 s; si el servidor responde 401 deja de consultar y `/health` pasa a `paired: false` (hay que volver a emparejar).

- Emparejar: en el sistema, Impresoras > "Emparejar este equipo" (genera un código y lo envía solo a `POST /pair`), o manualmente con el código.
- `agentToken` (`<agentId>.<secreto>`) se guarda en `config.json` y solo se envía en el header `Authorization: Bearer`; nunca se escribe en `agent.log`.
- Los trabajos que esperan más de 15 minutos vencen en el servidor y no se imprimen.

Los errores son JSON `{ "message": "..." }` en español.

## Desarrollo

```bash
pnpm install
pnpm --filter pullstok-print-agent test        # vitest (spooler simulado; no imprime de verdad)
pnpm --filter pullstok-print-agent typecheck
pnpm --filter pullstok-print-agent build:exe    # dist/PullstokPrintAgent.exe + dist/PullstokPrint-Setup.exe
```

`build` hace: esbuild (bundle CJS) > Node SEA (`--experimental-sea-config` + postject sobre una copia de `node.exe`) > se marca el exe como app de ventana (sin consola) y se le quita la firma de Node > instalador con IExpress (viene con Windows; el instalador ejecuta `installer/install.ps1`). Requiere Windows y Node >= 20. La salida está en `print-agent/dist/` (ignorada por git; no se commitean binarios). El `.exe` pesa ~88 MB porque incluye el runtime de Node; el instalador ~25 MB (comprimido).

## Publicar un Release

Solo con autorización explícita. Subí la versión en `package.json`, corré el build y publicá:

```bash
gh release create print-agent-vX.Y.Z print-agent/dist/PullstokPrint-Setup.exe \
  --title "Pullstok Print vX.Y.Z" \
  --notes "Agente de impresión local para tickets ESC/POS."
```

URL estable de descarga (siempre apunta al último release; el asset debe llamarse exactamente `PullstokPrint-Setup.exe`):

<https://github.com/emcon84/pullstok-erp/releases/latest/download/PullstokPrint-Setup.exe>

> Nota: `releases/latest` apunta al último release **del repositorio**. Si se publican otros releases que no sean del agente, ese enlace dejaría de servir el instalador.
