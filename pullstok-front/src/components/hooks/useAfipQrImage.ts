import { useMemo } from "react";
import type { AfipQrPayload } from "@/utils/afipQr";
import { generateAfipQrDataUrl } from "@/utils/afipQrImage";

/**
 * Convierte el payload del QR fiscal AFIP en una data URL PNG renderizable
 * como <img>. Generación SÍNCRONA en useMemo (no en useEffect): el botón de
 * impresión dispara window.print() en el mismo tick del click, y si el QR se
 * genera en un effect post-paint el <img> puede no tener src cuando el
 * navegador captura la página → QR vacío en el PDF. Con useMemo el data URL
 * ya está listo cuando el componente se pinta.
 *
 * Devuelve null cuando no hay payload o el canvas no está disponible (jsdom)
 * — el componente PrintInvoice muestra el CAE como texto en ese caso.
 */
export const useAfipQrImage = (payload: AfipQrPayload | null): string | null => {
  return useMemo(() => (payload ? generateAfipQrDataUrl(payload) : null), [payload]);
};