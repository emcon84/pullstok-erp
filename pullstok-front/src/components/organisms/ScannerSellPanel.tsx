import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import {
  useScannerSell,
  type ScanSellResult,
  type ScannedProduct,
} from "@/components/hooks/useScannerSell";
import { VendorCartSheet } from "@/components/molecules/VendorCartSheet";
import { getProductStock } from "@/services/productService";
import { getMe } from "@/services/onboardingService";
import { formatCurrency } from "@/utils/statsHelpers";

interface ScannerSellPanelProps {
  /** Sucursal efectiva del scanner (null = todavía sin elegir). */
  branchId: string | null;
  /** El scanner registra acá el handler que recibe cada producto escaneado. */
  registerScanHandler: (
    handler: ((product: ScannedProduct) => Promise<ScanSellResult>) | null,
  ) => void;
}

/**
 * Modo "Vender" del scanner: aviso "Agregado: Nombre ×N" con +/−, barra fija
 * inferior (ítems + total) y la hoja de pedido existente (VendorCartSheet) para
 * revisar y cobrar sin salir del scanner. Usa el carrito compartido
 * (useVendorCart) y el mismo checkout que PriceKgLookup/VendorDashboard.
 */
export const ScannerSellPanel = ({
  branchId,
  registerScanHandler,
}: ScannerSellPanelProps) => {
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useVendorCart();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  // Stock de la sucursal (en unidades). Sin la sucursal en la respuesta no hay
  // dato confiable: se rechaza (el scanner avisa) en vez de asumir 0 o infinito.
  const getBranchStock = useCallback(async (productId: string, branch: string) => {
    const res = await getProductStock(productId);
    const row = res.branches.find((b) => b.branchId === branch);
    if (!row) throw new Error("Sin stock de la sucursal");
    return row.quantity;
  }, []);

  const sell = useScannerSell({
    cart,
    branchId,
    sellsWholesale: me?.sellsWholesale ?? false,
    getBranchStock,
  });

  useEffect(() => {
    registerScanHandler(sell.addScanned);
    return () => registerScanHandler(null);
  }, [registerScanHandler, sell.addScanned]);

  const checkout = useVendorCheckout({
    branchId: branchId ?? "",
    cartOpen,
    setCartOpen,
    cartItems: cart.items,
    clearCart: cart.clearCart,
    totalAmount: cart.totalAmount,
  });
  // Caja OPEN de la sucursal (R8/R9): se propaga al confirmar la venta.
  const { session: currentSession } = useGetCurrentCashSession(branchId ?? undefined);

  return (
    <>
      {sell.lastAdded && (
        <div className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 p-3">
          <p className="min-w-0 flex-1 text-base font-semibold leading-snug text-green-900">
            Agregado: {sell.lastAdded.name} ×{sell.lastAdded.quantity}
          </p>
          <Button
            size="icon"
            variant="outline"
            className="h-12 w-12 shrink-0"
            aria-label="Restar uno"
            onClick={() => sell.adjustLast(-1)}
          >
            <Minus className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-12 w-12 shrink-0"
            aria-label="Sumar uno"
            onClick={() => sell.adjustLast(1)}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      )}

      {cart.itemCount > 0 && (
        // Por encima de la BottomBar móvil (h-16, z-50); en escritorio pegada abajo.
        <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-background p-3 shadow-lg lg:bottom-0">
          <button
            type="button"
            aria-label="Ver pedido"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-14 w-full max-w-lg touch-manipulation items-center justify-between rounded-xl bg-primary px-5 text-primary-foreground active:scale-[0.98]"
          >
            <span className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="h-5 w-5" />
              {cart.itemCount}
            </span>
            <span className="text-lg font-bold tabular-nums">
              {formatCurrency(cart.totalAmount)}
            </span>
          </button>
        </div>
      )}

      <VendorCartSheet
        open={cartOpen}
        cart={{ items: cart.items, totalAmount: cart.totalAmount }}
        status={{
          confirming: checkout.confirming,
          savingOrder: checkout.savingOrder,
        }}
        handlers={{
          onOpenChange: setCartOpen,
          updateQty: cart.updateQuantity,
          remove: cart.removeFromCart,
          clearCart: cart.clearCart,
          saveOrder: checkout.handleSaveOrder,
          confirmSale: checkout.handleConfirmSale,
        }}
        cashSessionId={currentSession?.id}
      />
    </>
  );
};
