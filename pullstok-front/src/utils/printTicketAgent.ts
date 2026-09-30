import { isAgentEnabled, printBytesViaAgent } from "@/utils/directPrintAgent";
import { encodeSaleTicketEscPos } from "@/utils/escpos";
import { loadLogoRaster } from "@/utils/printTicketDirect";
import {
  fetchRelayPrinters,
  rememberPrinter,
  resolveRelayTarget,
  sendTicketToRelay,
  type RelayPrinter,
} from "@/utils/relayPrint";
import { printSaleTicket, type SaleTicket } from "@/utils/saleTicket";

export interface PrintViaAgentOptions {
  /**
   * Se llama SOLO cuando el agente estaba habilitado, se intentó y falló, y no
   * hubo relay: justo antes de abrir el panel de Chrome (window.print() bloquea
   * el hilo).
   */
  onAgentFailure?: (error: unknown) => void;
  /** Sucursal del ticket: decide la impresora del relay (la recordada / la de la sucursal). */
  branchId?: string | null;
  /** Se llama cuando el ticket quedó encolado en el servidor (para seguir el estado del job). */
  onRelayJob?: (jobId: string, printer: RelayPrinter) => void;
  /** El relay no pudo encolar el ticket; se cae al panel de Chrome. */
  onRelayFailure?: (error: unknown) => void;
  /**
   * Hay varias impresoras posibles y ninguna recordada: devuelve el id elegido o
   * null si el usuario cancela. Sin este callback, varias impresoras => panel.
   */
  chooseRelayPrinter?: (printers: RelayPrinter[]) => Promise<string | null>;
  /**
   * Si el agente/relay no imprimió, abrir el panel de Chrome (default true). En
   * false nunca se abre: devuelve "failed" (el relay falló) o "no-printers".
   */
  panelFallback?: boolean;
}

export type PrintViaAgentResult = "agent" | "relay" | "panel" | "cancelled" | "failed" | "no-printers";

/**
 * Orden de impresión del ticket:
 * 1. Agente local (ESC/POS crudo) si esta PC lo tiene habilitado.
 * 2. Relay por servidor a la ticketera del local, si la org tiene impresoras
 *    activas (el celular no puede hablar con `localhost`).
 * 3. Panel de impresión de Chrome.
 * Nunca lanza: la venta ya está confirmada.
 */
export async function printSaleTicketViaAgent(
  ticket: SaleTicket,
  options: PrintViaAgentOptions = {},
): Promise<PrintViaAgentResult> {
  let agentError: unknown;
  let agentFailed = false;

  if (isAgentEnabled()) {
    try {
      const logo = await loadLogoRaster(ticket.logoUrl);
      await printBytesViaAgent(encodeSaleTicketEscPos(ticket, { logo, cut: true }));
      return "agent";
    } catch (error) {
      agentFailed = true;
      agentError = error;
    }
  }

  const relay = await tryRelay(ticket, options);
  if (relay === "relay" || relay === "cancelled") return relay;

  if (options.panelFallback === false) {
    return relay === "failed" ? "failed" : "no-printers";
  }

  if (agentFailed) {
    try {
      options.onAgentFailure?.(agentError);
    } catch {
      // El aviso es accesorio: no debe impedir el respaldo.
    }
  }

  try {
    await printSaleTicket(ticket);
  } catch {
    // Sin respaldo posible: la venta no se toca.
  }
  return "panel";
}

async function tryRelay(
  ticket: SaleTicket,
  options: PrintViaAgentOptions,
): Promise<"relay" | "cancelled" | "unavailable" | "failed"> {
  const branchId = options.branchId ?? null;
  try {
    const target = resolveRelayTarget(await fetchRelayPrinters(), branchId);
    let printer: RelayPrinter | undefined;

    if (target.kind === "printer") {
      printer = target.printer;
    } else if (target.kind === "choose") {
      if (!options.chooseRelayPrinter) return "unavailable";
      const chosen = await options.chooseRelayPrinter(target.printers);
      if (!chosen) return "cancelled";
      printer = target.printers.find((p) => p.id === chosen);
    }
    if (!printer) return "unavailable";

    const job = await sendTicketToRelay(ticket, printer.id);
    rememberPrinter(branchId, printer.id);
    try {
      options.onRelayJob?.(job.id, printer);
    } catch {
      // El seguimiento es accesorio: el ticket ya está encolado.
    }
    return "relay";
  } catch (error) {
    try {
      options.onRelayFailure?.(error);
    } catch {
      // Aviso accesorio.
    }
    return "failed";
  }
}
