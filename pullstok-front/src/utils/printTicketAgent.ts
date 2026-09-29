import { isAgentEnabled, printBytesViaAgent } from "@/utils/directPrintAgent";
import { encodeSaleTicketEscPos } from "@/utils/escpos";
import { loadLogoRaster } from "@/utils/printTicketDirect";
import { printSaleTicket, type SaleTicket } from "@/utils/saleTicket";

export interface PrintViaAgentOptions {
  /**
   * Se llama SOLO cuando el agente estaba habilitado, se intentó y falló, justo
   * antes de abrir el panel de Chrome (window.print() bloquea el hilo).
   */
  onAgentFailure?: (error: unknown) => void;
}

/**
 * Imprime el ticket por el agente local (ESC/POS crudo) si esta PC lo tiene
 * habilitado; ante cualquier falla (agente caído, sin impresora, 4xx/5xx,
 * timeout) cae al panel de Chrome. Con el agente deshabilitado va directo al
 * panel sin tocar la red. Nunca lanza: la venta ya está confirmada.
 */
export async function printSaleTicketViaAgent(
  ticket: SaleTicket,
  options: PrintViaAgentOptions = {},
): Promise<"agent" | "panel"> {
  if (isAgentEnabled()) {
    try {
      const logo = await loadLogoRaster(ticket.logoUrl);
      await printBytesViaAgent(encodeSaleTicketEscPos(ticket, { logo, cut: true }));
      return "agent";
    } catch (error) {
      try {
        options.onAgentFailure?.(error);
      } catch {
        // El aviso es accesorio: no debe impedir el respaldo.
      }
    }
  }

  try {
    await printSaleTicket(ticket);
  } catch {
    // Sin respaldo posible: la venta no se toca.
  }
  return "panel";
}
