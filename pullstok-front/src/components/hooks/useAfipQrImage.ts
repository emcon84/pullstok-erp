import { useEffect, useState } from "react";
import type { AfipQrPayload } from "@/utils/afipQr";
import { generateAfipQrDataUrl } from "@/utils/afipQrImage";

/**
 * Convierte el payload del QR fiscal AFIP en una data URL PNG renderizable
 * como <img>. Se regenera cuando cambia la identidad del payload. Devuelve
 * null mientras no hay payload o cuando el canvas no está disponible (ver
 * generateAfipQrDataUrl) — el componente PrintInvoice muestra el CAE como
 * texto en ese caso, nunca rompe.
 */
export const useAfipQrImage = (payload: AfipQrPayload | null): string | null => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    setQrDataUrl(payload ? generateAfipQrDataUrl(payload) : null);
  }, [payload]);

  return qrDataUrl;
};