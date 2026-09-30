import {
  createPrintJob,
  getActivePrinters,
  getPrintJob,
  type ActivePrinter,
} from "@/services/printerService";
import { encodeSaleTicketEscPos } from "@/utils/escpos";
import { loadLogoRaster } from "@/utils/printTicketDirect";
import type { SaleTicket } from "@/utils/saleTicket";

/**
 * Impresión desde el celular por relay de servidor: el celular arma los bytes
 * ESC/POS, el backend los encola y el agente de la PC de caja los imprime.
 */

export type RelayPrinter = ActivePrinter;

export type RelayPhase = "pending" | "printed" | "expired" | "error";
export interface RelayUpdate {
  phase: RelayPhase;
  message: string;
}
export type RelayResult = RelayUpdate | { phase: "aborted"; message: string };

export const JOB_MESSAGES = {
  sending: "Enviando a la impresora…",
  pending: "Imprimiendo…",
  printed: "Ticket impreso",
  expired:
    "El ticket venció: la PC de caja no lo imprimió en 15 minutos. Revisá que esté prendida y volvé a imprimir.",
  error: "No se pudo imprimir el ticket",
  lostTrack: "No se pudo consultar el estado de la impresión. Revisá en la caja si salió el ticket.",
} as const;

// ---------- Payload ----------

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Ticket ESC/POS (con logo si se puede rasterizar y corte) en base64. */
export async function encodeTicketPayload(ticket: SaleTicket): Promise<string> {
  const logo = await loadLogoRaster(ticket.logoUrl);
  return toBase64(encodeSaleTicketEscPos(ticket, { logo, cut: true }));
}

export async function sendTicketToRelay(
  ticket: SaleTicket,
  printerId: string,
): Promise<{ id: string }> {
  const payloadBase64 = await encodeTicketPayload(ticket);
  const job = await createPrintJob(printerId, payloadBase64);
  return { id: job.id };
}

// ---------- Impresora recordada por sucursal ----------

const PRINTER_KEY_PREFIX = "pullstok-relay-printer:";
const branchKey = (branchId: string | null) => `${PRINTER_KEY_PREFIX}${branchId ?? "_"}`;

// localStorage puede lanzar (modo privado, permisos): siempre dentro de try/catch.
export function getRememberedPrinterId(branchId: string | null): string | null {
  try {
    return localStorage.getItem(branchKey(branchId));
  } catch {
    return null;
  }
}

export function rememberPrinter(branchId: string | null, printerId: string): void {
  try {
    localStorage.setItem(branchKey(branchId), printerId);
  } catch {
    // Preferencia accesoria: si no se puede guardar, se sigue.
  }
}

export type RelayTarget =
  | { kind: "none" }
  | { kind: "printer"; printer: RelayPrinter }
  | { kind: "choose"; printers: RelayPrinter[] };

/**
 * A qué impresora va el ticket: la recordada de la sucursal; si no, la única de
 * la sucursal; si la sucursal no tiene ninguna, la única activa de la org; si
 * hay varias candidatas, el usuario elige.
 */
export function resolveRelayTarget(
  printers: RelayPrinter[],
  branchId: string | null,
): RelayTarget {
  if (printers.length === 0) return { kind: "none" };
  const remembered = getRememberedPrinterId(branchId);
  const rememberedPrinter = remembered ? printers.find((p) => p.id === remembered) : undefined;
  if (rememberedPrinter) return { kind: "printer", printer: rememberedPrinter };

  const ofBranch = branchId ? printers.filter((p) => p.branchId === branchId) : [];
  const candidates = ofBranch.length > 0 ? ofBranch : printers;
  if (candidates.length === 1) return { kind: "printer", printer: candidates[0] };
  return { kind: "choose", printers: candidates };
}

// ---------- Lista de impresoras activas (cache corto) ----------

const PRINTERS_TTL_MS = 60_000;
let printersCache: { at: number; printers: RelayPrinter[] } | null = null;

export function _resetRelayPrintersCache(): void {
  printersCache = null;
}

/**
 * Lista de impresoras activas (cache corto). LANZA si el pedido falla (401/403/500,
 * sin red), para distinguir "falló" de "no hay impresoras" (lista vacía).
 */
export async function fetchRelayPrinters(): Promise<RelayPrinter[]> {
  if (printersCache && Date.now() - printersCache.at < PRINTERS_TTL_MS) {
    return printersCache.printers;
  }
  const printers = await getActivePrinters();
  printersCache = { at: Date.now(), printers };
  return printers;
}

/** Nunca lanza: sin permiso (403), sin red o sin impresoras => lista vacía. */
export async function loadRelayPrinters(): Promise<RelayPrinter[]> {
  try {
    return await fetchRelayPrinters();
  } catch {
    return [];
  }
}

// ---------- Seguimiento del job ----------

export interface WatchOptions {
  intervalMs?: number;
  /** Tope total de espera: el job vence a los 15 min en el servidor. */
  timeoutMs?: number;
  maxConsecutiveErrors?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
}

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 16 * 60 * 1000;
const DEFAULT_MAX_ERRORS = 8;

/**
 * Consulta el job hasta que termine (impreso / venció / error). Tolera cortes de
 * red pasajeros; si se pierde el seguimiento avisa sin afirmar que falló.
 */
export async function watchPrintJob(
  jobId: string,
  onUpdate: (update: RelayUpdate) => void,
  options: WatchOptions = {},
): Promise<RelayResult> {
  const interval = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxErrors = options.maxConsecutiveErrors ?? DEFAULT_MAX_ERRORS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  let errors = 0;

  const finish = (update: RelayUpdate): RelayUpdate => {
    onUpdate(update);
    return update;
  };

  for (;;) {
    if (options.signal?.aborted) return { phase: "aborted", message: "" };
    try {
      const job = await getPrintJob(jobId);
      errors = 0;
      if (options.signal?.aborted) return { phase: "aborted", message: "" };
      if (job.status === "PRINTED") return finish({ phase: "printed", message: JOB_MESSAGES.printed });
      if (job.status === "EXPIRED") return finish({ phase: "expired", message: JOB_MESSAGES.expired });
      if (job.status === "ERROR") {
        const detail = job.errorMessage ? `: ${job.errorMessage}` : "";
        return finish({ phase: "error", message: `${JOB_MESSAGES.error}${detail}` });
      }
      onUpdate({ phase: "pending", message: JOB_MESSAGES.pending });
    } catch {
      errors++;
      if (errors >= maxErrors) return finish({ phase: "error", message: JOB_MESSAGES.lostTrack });
    }
    if (options.signal?.aborted) return { phase: "aborted", message: "" };
    if (now() - started >= timeout) return finish({ phase: "expired", message: JOB_MESSAGES.expired });
    await sleep(interval);
  }
}
