import { useEffect, useRef } from "react";
import type { RefObject } from "react";

interface PanelKeyboardOptions {
  /** Contenedor del panel (aside). Solo actúa cuando el foco está dentro. */
  panelRef: RefObject<HTMLElement>;
  /** Devuelve los controles focusables del panel, en orden de tabulación. */
  getFocusables: () => HTMLElement[];
  /** Se llama al volver al listado (←, o ↑ en el primer control). */
  onExitToGrid: () => void;
  /** +/− sobre la cantidad de un ítem del pedido (lineKey identifica la línea). */
  onStepQty?: (lineKey: string, delta: 1 | -1) => void;
  /** Tecla P: guardar pedido (funciona dentro del panel). */
  onSaveOrder?: () => void;
  /** Tecla V: vender el pedido (funciona dentro del panel). */
  onConfirmSale?: () => void;
}

/**
 * Roving focus del PANEL DE PEDIDO del POS vendedor.
 *
 * Cuando el foco está DENTRO del panel:
 * - ↑/↓ navegan entre los controles (items, descuento, medios de pago, botones).
 * - ← vuelve al listado (o ↑ en el primer control).
 * - +/− ajustan la cantidad del ítem del pedido sobre el que está el foco
 *   (solo dentro de una fila de ítem marcada con `data-line-key`).
 *
 * No interfiere con el listado (esa zona usa su propio hook). El salto
 * listado → panel lo dispara la flecha → del hook del listado.
 */
export function usePanelKeyboard({
  panelRef,
  getFocusables,
  onExitToGrid,
  onStepQty,
  onSaveOrder,
  onConfirmSale,
}: PanelKeyboardOptions) {
  const optsRef = useRef({
    getFocusables,
    onExitToGrid,
    onStepQty,
    onSaveOrder,
    onConfirmSale,
  });

  useEffect(() => {
    optsRef.current = {
      getFocusables,
      onExitToGrid,
      onStepQty,
      onSaveOrder,
      onConfirmSale,
    };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      const active = document.activeElement;
      // Solo actúa si el foco está dentro del panel.
      if (!panel || !panel.contains(active)) return;

      const key = e.key;

      // ── +/− : ajustar la cantidad del ítem bajo el foco ──
      const isStep =
        key === "+" ||
        key === "=" ||
        e.code === "NumpadAdd" ||
        key === "-" ||
        e.code === "NumpadSubtract";
      if (isStep) {
        const lineEl = (active as HTMLElement).closest?.(
          "[data-line-key]",
        ) as HTMLElement | null;
        if (lineEl) {
          const lineKey = lineEl.getAttribute("data-line-key");
          if (lineKey) {
            e.preventDefault();
            e.stopPropagation();
            const delta: 1 | -1 =
              key === "-" || e.code === "NumpadSubtract" ? -1 : 1;
            optsRef.current.onStepQty?.(lineKey, delta);
          }
        }
        return;
      }

      // ── P: guardar pedido · V: vender (también dentro del panel) ──
      if ((key === "p" || key === "P") && optsRef.current.onSaveOrder) {
        e.preventDefault();
        e.stopPropagation();
        optsRef.current.onSaveOrder();
        return;
      }
      if ((key === "v" || key === "V") && optsRef.current.onConfirmSale) {
        e.preventDefault();
        e.stopPropagation();
        optsRef.current.onConfirmSale();
        return;
      }

      if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "ArrowLeft") return;

      // ── ← : volver al listado (el panel es la columna derecha) ──
      if (key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        optsRef.current.onExitToGrid();
        return;
      }

      const els = optsRef.current.getFocusables();
      const idx = els.indexOf(active as HTMLElement);
      if (idx < 0) return; // el foco está en un elemento no listado (no navegar)

      if (key === "ArrowDown") {
        if (idx < els.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          els[idx + 1]?.focus();
        }
        // Último control: nos quedamos (no wrappeamos al listado).
        return;
      }

      // ArrowUp
      if (idx <= 0) {
        e.preventDefault();
        e.stopPropagation();
        optsRef.current.onExitToGrid();
      } else {
        e.preventDefault();
        e.stopPropagation();
        els[idx - 1]?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [panelRef]);
}
