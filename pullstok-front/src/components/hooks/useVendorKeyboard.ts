import { useEffect, useRef } from "react";
import type { RefObject, Dispatch, SetStateAction } from "react";
import { toast } from "react-toastify";
import type { DataItem } from "../../types";
import type { VendorCartItem } from "./useVendorCart";

export interface VendorKeyboardOptions {
  qtyModal: { product: DataItem } | null;
  qty: number;
  setQty: Dispatch<SetStateAction<number>>;
  items: DataItem[];
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  searchInputRef: RefObject<HTMLInputElement>;
  cartItems: VendorCartItem[];
  confirmAddToCart: () => void;
  handleDirectSale: () => void;
  handleSaveOrder: () => void;
  handleConfirmSale: () => void;
  openQtyModal: (product: DataItem) => void;
  branchQty: (p: DataItem) => number;
  setCartOpen: (open: boolean) => void;
}

/**
 * Accesos rápidos globales del vendor (/, L, ↑, ↓, Enter, +, -, C, P, V).
 * Registra el listener UNA vez en fase CAPTURE y lee las últimas opciones
 * desde un ref para no re-registrarse en cada render.
 *
 * Fase capture: es lo PRIMERO que corre (window capture > document capture >
 * target > document bubble > window bubble). Las extensiones de navegador
 * (Vimium: V=visual mode, P=pegar URL, L=forward, / = quick find) registran en
 * document bubble y se comerían las teclas antes que la app. En capture + con
 * stopPropagation la app se queda con la tecla y la extensión no la ve.
 */
export function useVendorKeyboard(options: VendorKeyboardOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const o = optionsRef.current;
      const activeElement = document.activeElement;
      const isTypingInInput =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          (activeElement as HTMLElement).isContentEditable);

      const key = e.key;

      // ── MODAL DE CANTIDAD ABIERTO ──
      // Dentro del modal no hay inputs propios, y el check isTypingInInput no
      // sirve acá: en iOS el buscador de atrás nunca pierde foco, así que esas
      // teclas quedarían muertas. El modal es el dueño del teclado mientras
      // está abierto.
      if (o.qtyModal) {
        if (key === "+" || key === "=" || e.code === "NumpadAdd") {
          e.preventDefault();
          e.stopPropagation();
          const maxStock = o.branchQty(o.qtyModal.product);
          o.setQty((q) => Math.min(maxStock > 0 ? maxStock : 999, q + 1));
          return;
        }
        if (key === "-" || e.code === "NumpadSubtract") {
          e.preventDefault();
          e.stopPropagation();
          o.setQty((q) => Math.max(1, q - 1));
          return;
        }
        if (key === "p" || key === "P") {
          e.preventDefault();
          e.stopPropagation();
          o.confirmAddToCart();
          return;
        }
        if (key === "v" || key === "V") {
          e.preventDefault();
          e.stopPropagation();
          o.handleDirectSale();
          return;
        }
        if (key === "Enter") {
          // NO auto-vender con Enter: el modal se abrió al presionar Enter en el
          // buscador y un segundo Enter lo cerraría sellando antes de fijar la
          // cantidad. El usuario elige la acción con V / P o los botones.
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        return;
      }

      // ── TECLAS GENERALES (SIN MODAL) ──

      // Tecla / o Cmd+K / Ctrl+K: Posiciona el cursor en el buscador y selecciona el texto.
      // NO lleva el guard isTypingInInput: es la tecla de "volver al buscador" por
      // diseño. Si la "barra" dependiera del foco, al cerrar un modal (que restaura
      // el foco al trigger o deja la página sin foco) dejaría de funcionar justo
      // cuando más se la necesita.
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

      // Tecla L: Salta al listado de productos (selecciona el primer ítem)
      if ((key === "l" || key === "L") && !isTypingInInput) {
        e.preventDefault();
        e.stopPropagation();
        o.searchInputRef.current?.blur();
        if (o.items.length > 0) {
          o.setSelectedIndex((prev) => (prev < 0 ? 0 : prev));
        }
        return;
      }

      // Flecha abajo (ArrowDown): Navega hacia abajo en el listado
      if (key === "ArrowDown") {
        if (o.items.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          if (isTypingInInput) {
            o.searchInputRef.current?.blur();
          }
          o.setSelectedIndex((prev) => {
            if (prev < 0) return 0;
            return Math.min(o.items.length - 1, prev + 1);
          });
          return;
        }
      }

      // Flecha arriba (ArrowUp): Navega hacia arriba en el listado
      if (key === "ArrowUp") {
        if (o.items.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          if (isTypingInInput) {
            o.searchInputRef.current?.blur();
          }
          o.setSelectedIndex((prev) => {
            if (prev <= 0) return 0;
            return prev - 1;
          });
          return;
        }
      }

      // Tecla Enter: Abre el modal del producto seleccionado
      if (key === "Enter" && !isTypingInInput) {
        if (o.selectedIndex >= 0 && o.selectedIndex < o.items.length) {
          e.preventDefault();
          e.stopPropagation();
          o.openQtyModal(o.items[o.selectedIndex]);
          return;
        }
      }

      // Tecla P: Genera / guarda pedido
      if ((key === "p" || key === "P") && !isTypingInInput) {
        e.preventDefault();
        e.stopPropagation();
        if (o.cartItems.length > 0) {
          o.handleSaveOrder();
        } else {
          toast.info("Agregá productos al pedido primero");
        }
        return;
      }

      // Tecla V: Venta directa del carrito o abre modal del producto seleccionado
      if ((key === "v" || key === "V") && !isTypingInInput) {
        e.preventDefault();
        e.stopPropagation();
        if (o.cartItems.length > 0) {
          o.handleConfirmSale();
        } else if (o.selectedIndex >= 0 && o.selectedIndex < o.items.length) {
          o.openQtyModal(o.items[o.selectedIndex]);
        } else {
          toast.info("Seleccioná un producto del listado primero");
        }
        return;
      }

      // Tecla C: Abre el drawer del carrito para revisar el pedido antes de
      // guardarlo (P) o venderlo directo (V). Sin ítems, avisa.
      if ((key === "c" || key === "C") && !isTypingInInput) {
        e.preventDefault();
        e.stopPropagation();
        if (o.cartItems.length > 0) {
          o.setCartOpen(true);
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
