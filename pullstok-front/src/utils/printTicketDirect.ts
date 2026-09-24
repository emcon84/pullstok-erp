import { encodeSaleTicketEscPos, rasterFromImageData, type EscPosRaster } from "@/utils/escpos";
import { printSaleTicket, type SaleTicket } from "@/utils/saleTicket";
import {
  getConnectedPrinterPort,
  isSerialPrintingSupported,
  printBytes,
} from "@/utils/serialPrinter";
import { prepareTicketLogoBitmap } from "@/utils/ticketLogo";

export interface PrintDirectOptions {
  /**
   * Se llama SOLO cuando el envío directo se intentó y falló (no cuando
   * simplemente no hay impresora conectada), justo antes de abrir el panel de
   * Chrome: window.print() bloquea el hilo, así el aviso sale a tiempo.
   */
  onDirectFailure?: (error: unknown) => void;
}

/** Logo → raster de 1 bit; si no se puede, se imprime sin logo (nunca lanza). */
async function loadLogoRaster(logoUrl?: string | null): Promise<EscPosRaster | null> {
  if (!logoUrl) return null;
  try {
    const bitmap = await prepareTicketLogoBitmap(logoUrl);
    return bitmap ? rasterFromImageData(bitmap) : null;
  } catch {
    return null;
  }
}

/**
 * Imprime el ticket DIRECTO en la térmica por Web Serial si hay una impresora
 * conectada; en cualquier otro caso (sin soporte, sin puerto, o cualquier
 * error) cae al panel de impresión de Chrome (`printSaleTicket`). Nunca lanza:
 * la venta ya está confirmada y un fallo de impresión no puede afectarla.
 */
export async function printSaleTicketDirect(
  ticket: SaleTicket,
  options: PrintDirectOptions = {},
): Promise<"direct" | "panel"> {
  try {
    if (isSerialPrintingSupported() && (await getConnectedPrinterPort())) {
      const logo = await loadLogoRaster(ticket.logoUrl);
      await printBytes(encodeSaleTicketEscPos(ticket, { logo }));
      return "direct";
    }
  } catch (error) {
    try {
      options.onDirectFailure?.(error);
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
