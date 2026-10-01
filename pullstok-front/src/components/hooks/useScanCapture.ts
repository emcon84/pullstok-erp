import { useEffect, useRef } from "react";

interface UseScanCaptureOptions {
  /** Si es false el listener no se registra (no se captura ni se previene nada). */
  enabled: boolean;
  onScan: (code: string) => void;
}

const MIN_CODE_LENGTH = 6;
const RESET_GAP_MS = 400;
const BURST_GAP_MS = 60;

/**
 * Capturador global (fase CAPTURE) de la pistola USB HID, que emula teclado:
 * una ráfaga de caracteres alfanuméricos (>= 6) terminada en Enter. Réplica
 * del patrón de UnifiedPos (el vendedor); no lo reemplaza.
 * - Pausa > 400 ms resetea el buffer (el tipeo a mano no se intercepta).
 * - Caracteres en ráfaga (< 60 ms) y el Enter final se previenen para que no
 *   se escriban en el input enfocado.
 * - Teclas con nombre largo (Shift, Control...) no tocan el buffer.
 */
export const useScanCapture = ({ enabled, onScan }: UseScanCaptureOptions) => {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastKeyAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      const gap = now - lastKeyAt;
      if (gap > RESET_GAP_MS) buffer = "";
      lastKeyAt = now;

      if (e.key === "Enter") {
        const code = buffer;
        buffer = "";
        if (code.length >= MIN_CODE_LENGTH && /^[0-9A-Za-z]+$/.test(code)) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(code);
        }
        return;
      }
      if (/^[0-9A-Za-z]$/.test(e.key)) {
        if (buffer.length > 0 && gap < BURST_GAP_MS) {
          e.preventDefault();
          e.stopPropagation();
        }
        buffer += e.key;
      } else if (e.key.length === 1) {
        buffer = "";
      }
      // key.length > 1 (Shift, Control, CapsLock...): se ignora.
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
};
