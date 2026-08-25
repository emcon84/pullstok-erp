import { useEffect, useRef } from "react";
import type { RefObject } from "react";

interface PanelKeyboardOptions {
  /** Contenedor del panel (aside). Solo actúa cuando el foco está dentro. */
  panelRef: RefObject<HTMLElement>;
  /** Devuelve los controles focusables del panel, en orden de tabulación. */
  getFocusables: () => HTMLElement[];
  /** Se llama al pulsar ↑ en el primer control: volver al listado. */
  onExitToGrid: () => void;
}

/**
 * Roving focus del PANEL DE PEDIDO del POS vendedor.
 *
 * Cuando el foco está DENTRO del panel, las flechas ↑/↓ navegan entre sus
 * controles (items, descuento, medios de pago, botones). No interfiere con el
 * listado (esa zona tiene su propio hook). El salto listado → panel lo dispara
 * el hook del listado (↓ en la última fila); el retorno usa ↑ en el primer
 * control del panel. Los controles fuera de vista no se visitan.
 */
export function usePanelKeyboard({
  panelRef,
  getFocusables,
  onExitToGrid,
}: PanelKeyboardOptions) {
  const optsRef = useRef({ getFocusables, onExitToGrid });

  useEffect(() => {
    optsRef.current = { getFocusables, onExitToGrid };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      const active = document.activeElement;
      // Solo actúa si el foco está dentro del panel.
      if (!panel || !panel.contains(active)) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      const els = optsRef.current.getFocusables();
      const idx = els.indexOf(active as HTMLElement);
      if (idx < 0) return; // el foco está en un elemento no listado (no navegar)

      if (e.key === "ArrowDown") {
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
