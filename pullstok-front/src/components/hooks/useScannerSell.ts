import { useCallback, useRef, useState } from "react";
import type { DataItem, ProductPresentation } from "../../types";
import type { useVendorCart } from "./useVendorCart";
import { presentationLineName } from "./presentationHelpers";

/** Producto tal como lo resuelve el scanner (catálogo offline o /by-code). */
export type ScannedProduct = DataItem & { id: string };

type CartApi = Pick<
  ReturnType<typeof useVendorCart>,
  "items" | "addToCart" | "updateQuantity"
>;

export type ScanSellBlockReason =
  | "no-branch"
  | "stock-unavailable"
  | "no-stock"
  | "max-stock";

export type ScanSellResult =
  | { ok: true; name: string; quantity: number; picking?: true }
  | { ok: false; reason: ScanSellBlockReason; message: string };

export type ScanSellPlan =
  | { kind: "add"; quantity: number }
  | { kind: "set"; quantity: number }
  | { kind: "blocked"; reason: "no-stock" | "max-stock" };

/** Decide qué hace un escaneo: +1 unidad, tope por stock (salvo productos
 *  manuales, cuyo stock el server no valida). Espejo de `commit` del catálogo. */
export function planScanSell(input: {
  currentQty: number;
  stock: number;
  isManual?: boolean;
  /** Presentation factor: stock is in BASE units, so the gate is
   *  quantity × factor ≤ stock. Absent = 1; 0 ("pendiente") skips the gate. */
  factor?: number;
}): ScanSellPlan {
  const { currentQty, stock, isManual } = input;
  const factor = input.factor ?? 1;
  if (!isManual && factor >= 1) {
    if (stock < factor) return { kind: "blocked", reason: "no-stock" };
    if ((currentQty + 1) * factor > stock) return { kind: "blocked", reason: "max-stock" };
  }
  return currentQty > 0
    ? { kind: "set", quantity: currentQty + 1 }
    : { kind: "add", quantity: 1 };
}

const MESSAGES: Record<ScanSellBlockReason, string> = {
  "no-branch": "Elegí la sucursal para vender",
  "stock-unavailable": "No se pudo verificar el stock. Revisá la conexión",
  "no-stock": "Producto sin stock",
  "max-stock": "No hay más stock disponible",
};

const blocked = (reason: ScanSellBlockReason, name?: string): ScanSellResult => ({
  ok: false,
  reason,
  message: name && reason !== "no-branch" ? `${MESSAGES[reason]}: ${name}` : MESSAGES[reason],
});

// Los productos del scanner se venden siempre como bolsa/caja cerrada (mismo
// default que el catálogo con "Vender por unidad" apagado). Sueltos por kg y
// blisters se venden desde sus propias pantallas (piden peso/monto/conteo).
const MODE = "BOLSA_CERRADA" as const;

interface UseScannerSellParams {
  cart: CartApi;
  /** Sucursal efectiva del scanner; null = todavía sin elegir. */
  branchId: string | null;
  sellsWholesale?: boolean;
  /** Stock (en unidades) del producto en la sucursal; rechaza si no se puede leer. */
  getBranchStock: (productId: string, branchId: string) => Promise<number>;
}

/**
 * Modo "Vender" del scanner: cada escaneo suma 1 unidad al carrito compartido
 * (useVendorCart, localStorage "vendor-cart"). Mantiene la última línea
 * agregada para el aviso "Agregado: Nombre ×N" con +/−.
 */
export function useScannerSell({
  cart,
  branchId,
  sellsWholesale,
  getBranchStock,
}: UseScannerSellParams) {
  const itemsRef = useRef(cart.items);
  itemsRef.current = cart.items;
  const [last, setLast] = useState<{
    productId: string;
    name: string;
    stock: number;
    isManual: boolean;
    presentation?: ProductPresentation;
  } | null>(null);
  // sdd/product-presentations: producto escaneado con presentaciones, a la espera
  // de que el vendedor elija una (stock en unidades base de la sucursal).
  const [picker, setPicker] = useState<{ product: ScannedProduct; stock: number } | null>(null);

  const qtyOf = (productId: string, presentationId?: string) =>
    itemsRef.current.find(
      (i) =>
        i.productId === productId &&
        (i.saleMode ?? MODE) === MODE &&
        !i.loosePriceId &&
        (i.presentationId ?? null) === (presentationId ?? null),
    )?.quantity ?? 0;

  const addScanned = useCallback(
    async (product: ScannedProduct): Promise<ScanSellResult> => {
      if (!branchId) return blocked("no-branch");
      let stock: number;
      try {
        stock = await getBranchStock(product.id, branchId);
      } catch {
        return blocked("stock-unavailable");
      }
      const isManual = !!product.isManual;
      if (product.hasPresentations) {
        setPicker({ product, stock });
        return { ok: true, name: product.name, quantity: 0, picking: true };
      }
      const plan = planScanSell({ currentQty: qtyOf(product.id), stock, isManual });
      if (plan.kind === "blocked") return blocked(plan.reason, product.name);
      if (plan.kind === "add") {
        cart.addToCart(product, 1, branchId, stock, MODE, undefined, undefined, undefined, sellsWholesale);
      } else {
        cart.updateQuantity(product.id, plan.quantity, MODE);
      }
      setLast({ productId: product.id, name: product.name, stock, isManual });
      return { ok: true, name: product.name, quantity: plan.quantity };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branchId, sellsWholesale, getBranchStock, cart.addToCart, cart.updateQuantity],
  );

  const confirmPresentation = useCallback(
    (presentation: ProductPresentation): ScanSellResult => {
      if (!picker || !branchId) return blocked("no-branch");
      const { product, stock } = picker;
      const isManual = !!product.isManual;
      const lineName = presentationLineName(product.name, presentation.name);
      const plan = planScanSell({
        currentQty: qtyOf(product.id, presentation.id),
        stock,
        isManual,
        factor: presentation.factor,
      });
      if (plan.kind === "blocked") return blocked(plan.reason, lineName);
      setPicker(null);
      if (plan.kind === "add") {
        cart.addToCart(
          product, 1, branchId, stock, MODE, undefined, undefined, undefined,
          sellsWholesale, undefined, presentation,
        );
      } else {
        cart.updateQuantity(product.id, plan.quantity, MODE, undefined, presentation.id);
      }
      setLast({ productId: product.id, name: lineName, stock, isManual, presentation });
      return { ok: true, name: lineName, quantity: plan.quantity };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picker, branchId, sellsWholesale, cart.addToCart, cart.updateQuantity],
  );

  const cancelPicker = useCallback(() => setPicker(null), []);

  const adjustLast = useCallback(
    (delta: 1 | -1) => {
      if (!last) return;
      const pid = last.presentation?.id;
      const current = qtyOf(last.productId, pid);
      const next = current + delta;
      if (next <= 0) {
        cart.updateQuantity(last.productId, 0, MODE, undefined, pid);
        setLast(null);
        return;
      }
      const factor = last.presentation?.factor ?? 1;
      if (!last.isManual && factor >= 1 && next * factor > last.stock) return;
      cart.updateQuantity(last.productId, next, MODE, undefined, pid);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [last, cart.updateQuantity],
  );

  const current = last ? qtyOf(last.productId, last.presentation?.id) : 0;
  // Si la línea salió del carrito (p. ej. se quitó desde la hoja), el aviso desaparece.
  const lastAdded = last && current > 0 ? { productId: last.productId, name: last.name, quantity: current } : null;

  return { addScanned, adjustLast, lastAdded, picker, confirmPresentation, cancelPicker };
}
