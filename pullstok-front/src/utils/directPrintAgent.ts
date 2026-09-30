/**
 * Cliente del agente local de impresión (print-agent/): recibe bytes ESC/POS y
 * los manda CRUDOS a la térmica por el spooler de Windows. Todas las llamadas
 * tienen timeout corto: un agente caído nunca debe frenar el POS.
 */

export const DEFAULT_AGENT_URL = "http://127.0.0.1:9123";
export const AGENT_URL_KEY = "pullstok-print-agent-url";
export const AGENT_ENABLED_KEY = "pullstok-print-agent-enabled";

const QUICK_TIMEOUT_MS = 2000;
const PRINT_TIMEOUT_MS = 3000;
// Emparejar viaja agente -> servidor -> agente: necesita más margen que un /health.
const PAIR_TIMEOUT_MS = 15000;

export interface AgentHealth {
  name: string;
  version: string;
  printer: string | null;
  platform: string;
  /** Agente >= 1.1.0: si ya está emparejado con el servidor (relay). */
  paired?: boolean;
  serverUrl?: string;
}

export class DirectPrintAgentError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "DirectPrintAgentError";
    this.status = status;
  }
}

// localStorage puede lanzar (modo privado, permisos): siempre dentro de try/catch.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Preferencia accesoria: si no se puede guardar, se sigue.
  }
}

export function getAgentBaseUrl(): string {
  const stored = readStorage(AGENT_URL_KEY);
  return (stored || DEFAULT_AGENT_URL).replace(/\/+$/, "");
}

export function setAgentBaseUrl(url: string): void {
  writeStorage(AGENT_URL_KEY, url.trim() || null);
}

/** Preferencia por PC: solo con el flag prendido el POS intenta el agente. */
export function isAgentEnabled(): boolean {
  return readStorage(AGENT_ENABLED_KEY) === "1";
}

export function setAgentEnabled(enabled: boolean): void {
  writeStorage(AGENT_ENABLED_KEY, enabled ? "1" : null);
}

async function agentFetch(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${getAgentBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      let message = `El agente respondió con error (${response.status})`;
      try {
        const body = await response.json();
        if (body && typeof body.message === "string") message = body.message;
      } catch {
        // Cuerpo no JSON: se deja el mensaje genérico.
      }
      throw new DirectPrintAgentError(message, response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof DirectPrintAgentError) throw error;
    if (controller.signal.aborted) {
      throw new DirectPrintAgentError("El agente de impresión no respondió a tiempo");
    }
    throw new DirectPrintAgentError("No se pudo conectar con el agente de impresión");
  } finally {
    clearTimeout(timer);
  }
}

export async function getAgentHealth(): Promise<AgentHealth> {
  const response = await agentFetch("/health", { method: "GET" }, QUICK_TIMEOUT_MS);
  return response.json();
}

export async function getAgentPrinters(): Promise<string[]> {
  const response = await agentFetch("/printers", { method: "GET" }, QUICK_TIMEOUT_MS);
  const body = await response.json();
  return Array.isArray(body?.printers) ? body.printers : [];
}

export async function setAgentPrinter(printer: string): Promise<void> {
  await agentFetch(
    "/config",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printer }),
    },
    QUICK_TIMEOUT_MS,
  );
}

export async function printBytesViaAgent(bytes: Uint8Array): Promise<void> {
  await agentFetch(
    "/print",
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes as BodyInit,
    },
    PRINT_TIMEOUT_MS,
  );
}

export async function printAgentTest(): Promise<void> {
  await agentFetch("/test", { method: "POST" }, PRINT_TIMEOUT_MS);
}

export interface PairAgentResult {
  ok: boolean;
  agentId: string;
  name: string | null;
}

/**
 * Canjea un código de emparejamiento en el agente local: el agente lo valida
 * contra el servidor y guarda sus credenciales (nunca las devuelve al navegador).
 */
export async function pairAgent(code: string): Promise<PairAgentResult> {
  const response = await agentFetch(
    "/pair",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    },
    PAIR_TIMEOUT_MS,
  );
  return response.json();
}
