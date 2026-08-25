import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { toast } from "react-toastify";
import type { VendorCartItem } from "./useVendorCart";

export interface VendorRowsKeyboardOptions {
  /** Input de búsqueda: su foco es el único guard que bloquea las teclas de una
   *  sola letra (P/V) y Enter, para que se pueda tipear texto sin disparar
   *  atajos. Las flechas y +/- actúan SIEMPRE (roving focus sobre la tabla). */
  searchInputRef: RefObject<HTMLInputElement>;
  /** ¿Hay filas para navegar? Si no, las teclas de navegación son no-op. */
  hasRows: boolean;
  selectedIndex: number;
  /** Baja una fila (la tab se encarga de mover el índice + enfocar la fila). */
  moveDown: () => void;
  /** Sube una fila. */
  moveUp: () => void;
  /** Salta a la primera fila del listado (tecla L). */
  selectFirst: () => void;
  /** Suma cantidad a la fila activa. */
  onIncrement: () => void;
  /** Resta cantidad a la fila activa. */
  onDecrement: () => void;
  /** Confirma la fila activa (Enter): la agrega al pedido. */
  onCommitRow: () => void;
  cartItems: VendorCartItem[];
  handleSaveOrder: () => void;
  handleConfirmSale: () => void;
}

/**
 * Accesos rápidos del POS vendedor (/, L, ↑, ↓, Enter, +, -, P, V) para
 * tablas con INPUT INLINE de cantidad. Reemplaza la navegación basada en
 * modal: ↑/↓ mueven la fila activa (roving focus) aunque el foco esté en un
 * input de cantidad, +/− ajustan la cantidad de la fila activa y Enter la
 * agrega al pedido. Quita la tecla C (ya no hay drawer/FAB).
 *
 * Registra el listener UNA vez en fase CAPTURE y lee las últimas opciones
 * desde un ref para no re-registrarse en cada render.
 */
export function useVendorRowsKeyboard(options: VendorRowsKeyboardOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const o = optionsRef.current;
      const key = e.key;
      const isSearchFocused = o.searchInputRef.current === document.activeElement;
      const hasActiveRow = o.selectedIndex >= 0 && o.hasRows;

      // ── Tecla / o Cmd+K / Ctrl+K: foco al buscador ──
      // Sin guard: es la tecla de "volver al buscador" por diseño.
      if (
        key === "/" ||
        ((e.metaKey || e.ctrlKey) && key.toLowerCase() === "k")
      ) {
        e.preventDefault();
        e.stopPropagation();
        o.searchInputRef.current?.focus();
        o.searchInputRef.current?.select();
        return;
      }

      // ── Tecla L: salta al listado (selecciona la primera fila) ──
      if ((key === "l" || key === "L") && !isSearchFocused) {
        e.preventDefault();
        e.stopPropagation();
        o.searchInputRef.current?.blur();
        if (o.hasRows) o.selectFirst();
        return;
      }

      // ── Flecha abajo: baja una fila ──
      if (key === "ArrowDown") {
        if (o.hasRows) {
          e.preventDefault();
          e.stopPropagation();
          o.moveDown();
        }
        return;
      }

      // ── Flecha arriba: sube una fila ──
      if (key === "ArrowUp") {
        if (o.hasRows) {
          e.preventDefault();
          e.stopPropagation();
          o.moveUp();
        }
        return;
      }

      // ── + / Suma: incrementa cantidad de la fila activa ──
      if (key === "+" || key === "=" || e.code === "NumpadAdd") {
        if (hasActiveRow) {
          e.preventDefault();
          e.stopPropagation();
          o.onIncrement();
        }
        return;
      }

      // ── − / Resta: decrementa cantidad de la fila activa ──
      if (key === "-" || e.code === "NumpadSubtract") {
        if (hasActiveRow) {
          e.preventDefault();
          e.stopPropagation();
          o.onDecrement();
        }
        return;
      }

      // ── Enter: confirma la fila activa al pedido ──
      // Gateado por !isSearchFocused: mientras tipeás en el buscador, Enter lo
      // maneja el propio VendorSearchBar (no abre modal: commit del activo).
      if (key === "Enter") {
        if (!isSearchFocused) {
          if (hasActiveRow) {
            e.preventDefault();
            e.stopPropagation();
            o.onCommitRow();
          }
          return;
        }
        // Buscador enfocado: deja que su handler decida (commit del activo).
        return;
      }

      // ── Tecla P: guardar pedido ──
      if ((key === "p" || key === "P") && !isSearchFocused) {
        e.preventDefault();
        e.stopPropagation();
        if (o.cartItems.length > 0) {
          o.handleSaveOrder();
        } else {
          toast.info("Agregá productos al pedido primero");
        }
        return;
      }

      // ── Tecla V: vender el carrito ──
      if ((key === "v" || key === "V") && !isSearchFocused) {
        e.preventDefault();
        e.stopPropagation();
        if (o.cartItems.length > 0) {
          o.handleConfirmSale();
        } else {
          toast.info("Agregá productos al pedido primero");
        }
        return;
      }
    };

    // Fase capture (true): nuestra app se queda con la tecla antes que las
    // extensiones del navegador (Vimium y similares) que escuchan en document.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
