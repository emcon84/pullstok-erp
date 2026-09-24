import { encodeTestTicketEscPos } from "@/utils/escpos";

/**
 * Transporte Web Serial (`navigator.serial`) para la térmica ESC/POS.
 *
 * Flujo: UNA vez `connectPrinter()` desde un click (Chrome muestra el selector
 * de puertos y recuerda el permiso); después `getPorts()` devuelve ese puerto y
 * `printBytes()` imprime en silencio, sin panel de Chrome. Solo funciona si
 * Windows expone la impresora como puerto COM (Bluetooth SPP siempre; USB
 * depende del driver). Quien llama decide el respaldo: acá todo falla con un
 * Error claro o un resultado tipado, nunca cuelga.
 */

// ── Tipos mínimos (la lib DOM de TS no trae Web Serial; sin dependencias) ──

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface ThermalSerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  /** Solo Chrome 103+; puede no existir. */
  forget?(): Promise<void>;
  getInfo(): SerialPortInfo;
  readonly writable: {
    getWriter(): {
      write(chunk: Uint8Array): Promise<void>;
      releaseLock(): void;
      abort?(reason?: unknown): Promise<void>;
    };
  } | null;
}

interface ThermalSerial {
  getPorts(): Promise<ThermalSerialPort[]>;
  requestPort(options?: object): Promise<ThermalSerialPort>;
}

export type ConnectResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "cancelled" | "error"; message?: string };

// ── Constantes ──

/** Clave de localStorage con el vendor/product del puerto elegido. */
export const PRINTER_STORAGE_KEY = "pullstok-thermal-printer";
/**
 * Baud rate al abrir el puerto. Bluetooth SPP lo ignora (el enlace no tiene
 * velocidad de línea); las térmicas USB-serie suelen usar 9600 o 115200. Se
 * elige 9600, el valor de fábrica más común en las 58 mm portátiles.
 */
const BAUD_RATE = 9600;
/** Bytes por escritura: un buffer Bluetooth chico se desborda con envíos enormes. */
const CHUNK_SIZE = 512;
/** Pausa entre chunks para que la impresora vacíe su buffer. */
const CHUNK_DELAY_MS = 20;
/** Tope de toda la impresión: el POS nunca queda colgado esperando el puerto. */
export const PRINT_TIMEOUT_MS = 10_000;
/** Cuánto esperar el cierre del puerto tras un timeout antes de soltarlo. */
const CLEANUP_GRACE_MS = 2000;

// ── Helpers ──

const errorName = (e: unknown) => (e as { name?: string } | null)?.name;
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function getSerial(): ThermalSerial | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as unknown as { serial?: ThermalSerial }).serial ?? null;
}

export function isSerialPrintingSupported(): boolean {
  if (typeof window !== "undefined" && window.isSecureContext === false) return false;
  return typeof navigator !== "undefined" && "serial" in navigator && !!getSerial();
}

function safeInfo(port: ThermalSerialPort): SerialPortInfo {
  try {
    return port.getInfo() ?? {};
  } catch {
    return {};
  }
}

function readStoredInfo(): SerialPortInfo | null {
  try {
    const raw = localStorage.getItem(PRINTER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SerialPortInfo) : null;
  } catch {
    return null; // storage bloqueado o JSON roto: se ignora
  }
}

function storeInfo(info: SerialPortInfo) {
  try {
    localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // Sin storage se elige el primer puerto recordado; no es crítico.
  }
}

function clearStoredInfo() {
  try {
    localStorage.removeItem(PRINTER_STORAGE_KEY);
  } catch {
    // ídem
  }
}

/** Puerto recordado por Chrome (permiso ya otorgado), o null. Nunca lanza. */
export async function getConnectedPrinterPort(): Promise<ThermalSerialPort | null> {
  const serial = getSerial();
  if (!serial) return null;
  try {
    const ports = await serial.getPorts();
    if (!ports.length) return null;
    const stored = readStoredInfo();
    if (stored && stored.usbVendorId !== undefined && stored.usbProductId !== undefined) {
      const match = ports.find((p) => {
        const info = safeInfo(p);
        return (
          info.usbVendorId === stored.usbVendorId && info.usbProductId === stored.usbProductId
        );
      });
      if (match) return match;
    }
    return ports[0];
  } catch {
    return null;
  }
}

// ── Envío ──

/** Cola: dos impresiones (o una prueba) nunca se pisan sobre el mismo puerto. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
}

/** Abre el puerto, escribe en chunks y siempre libera el lock y cierra. */
async function sendToPort(port: ThermalSerialPort, bytes: Uint8Array): Promise<void> {
  let writer: ReturnType<NonNullable<ThermalSerialPort["writable"]>["getWriter"]> | null = null;
  let opened = false;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const work = (async () => {
    try {
      await port.open({ baudRate: BAUD_RATE });
      opened = true;
    } catch (e) {
      // Ya abierto por una impresión anterior: se sigue usando (no lo cerramos).
      if (errorName(e) !== "InvalidStateError") throw e;
    }
    if (!port.writable) throw new Error("el puerto no permite escribir");
    writer = port.writable.getWriter();
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      await writer.write(bytes.subarray(offset, offset + CHUNK_SIZE));
      if (offset + CHUNK_SIZE < bytes.length) await sleep(CHUNK_DELAY_MS);
    }
  })();
  work.catch(() => {}); // si gana el timeout, su rechazo tardío no queda sin manejar

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      // Destraba una escritura colgada para poder soltar el lock y cerrar.
      try {
        void writer?.abort?.().catch(() => {});
      } catch {
        // best-effort
      }
      reject(new Error("Tiempo de espera agotado: la impresora no respondió"));
    }, PRINT_TIMEOUT_MS);
  });

  const cleanup = async () => {
    try {
      writer?.releaseLock();
    } catch {
      // lock ya liberado
    }
    if (opened) {
      try {
        await port.close();
      } catch {
        // cierre best-effort
      }
    }
  };

  try {
    await Promise.race([work, timeout]);
  } catch (e) {
    throw new Error(`No se pudo imprimir: ${errorMessage(e)}`);
  } finally {
    clearTimeout(timer);
    // Tras un timeout el cierre puede colgarse: se espera un rato y se suelta.
    await (timedOut ? Promise.race([cleanup(), sleep(CLEANUP_GRACE_MS)]) : cleanup());
  }
}

/** Imprime bytes ESC/POS en la impresora conectada. Rechaza ante cualquier fallo. */
export function printBytes(bytes: Uint8Array): Promise<void> {
  return enqueue(async () => {
    const port = await getConnectedPrinterPort();
    if (!port) throw new Error("No hay una impresora conectada");
    await sendToPort(port, bytes);
  });
}

// ── Conexión ──

async function forgetPort(port: ThermalSerialPort) {
  try {
    await port.forget?.();
  } catch {
    // best-effort
  }
  clearStoredInfo();
}

/**
 * Elige la impresora (selector de Chrome) y manda un ticket de prueba. DEBE
 * llamarse desde un gesto de usuario (click). Cancelar el selector no es un error.
 */
export async function connectPrinter(): Promise<ConnectResult> {
  const serial = getSerial();
  if (!serial || !isSerialPrintingSupported()) return { ok: false, reason: "unsupported" };

  let port: ThermalSerialPort;
  try {
    port = await serial.requestPort();
  } catch (e) {
    if (errorName(e) === "NotFoundError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "error", message: errorMessage(e) };
  }

  storeInfo(safeInfo(port));
  try {
    await enqueue(() => sendToPort(port, encodeTestTicketEscPos()));
    return { ok: true };
  } catch (e) {
    // Puerto equivocado / sin respuesta: no dejarlo "conectado" sin andar.
    await forgetPort(port);
    return { ok: false, reason: "error", message: errorMessage(e) };
  }
}

/** Olvida el puerto (permiso de Chrome) y lo guardado. Nunca lanza. */
export async function disconnectPrinter(): Promise<void> {
  try {
    const port = await getConnectedPrinterPort();
    if (port) await forgetPort(port);
  } finally {
    clearStoredInfo();
  }
}
