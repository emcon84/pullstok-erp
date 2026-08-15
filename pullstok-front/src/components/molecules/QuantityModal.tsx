import type { Dispatch, SetStateAction } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { imgSrc } from "@/components/hooks/vendorCatalogHelpers";
import { round2 } from "@/lib/money";
import type { DataItem } from "@/types";
import type { SaleMode } from "@/components/hooks/useVendorCart";

interface QuantityModalProps {
  product: DataItem | null;
  qty: number;
  setQty: Dispatch<SetStateAction<number>>;
  maxStock: number;
  directSelling: boolean;
  saleMode: SaleMode;
  setSaleMode: Dispatch<SetStateAction<SaleMode>>;
  amount: number;
  setAmount: Dispatch<SetStateAction<number>>;
  onDirectSale: () => void;
  onAddToCart: () => void;
  onClose: () => void;
}

// Etiquetas de modo de venta suelto (sdd/precios-suelto-planilla C-06):
// el modo describe la unidad de venta, no el empaque del producto.
const LOOSE_MODE_LABELS: Record<SaleMode, string> = {
  BOLSA_CERRADA: "Entero",
  POR_PESO: "Por kilo",
  POR_MONTO: "Por monto",
};

export const QuantityModal = ({
  product,
  qty,
  setQty,
  maxStock,
  directSelling,
  saleMode,
  setSaleMode,
  amount,
  setAmount,
  onDirectSale,
  onAddToCart,
  onClose,
}: QuantityModalProps) => {
  const isLoose = (product?.priceKgSuelto ?? 0) > 0;
  const priceKgSuelto = product?.priceKgSuelto ?? null;
  // kg preview (POR_MONTO only)
  const kgPreview =
    saleMode === "POR_MONTO" && priceKgSuelto && amount > 0
      ? round2(amount / priceKgSuelto)
      : null;

  // Price to display: POR_PESO / POR_MONTO shows priceKgSuelto; BOLSA shows unit price.
  const displayPrice =
    saleMode === "BOLSA_CERRADA"
      ? Number(product?.price ?? 0)
      : (priceKgSuelto ?? 0);

  const total =
    saleMode === "POR_MONTO"
      ? amount
      : round2(displayPrice * (saleMode === "POR_PESO" ? qty : qty));

  // Display stock per mode: kg for loose, bags for BOLSA_CERRADA.
  // After DB conversion, ProductStock.quantity is in kg.
  const weightKg = product?.weightKg ?? null;
  const maxBags =
    weightKg && weightKg > 0 ? Math.floor(maxStock / weightKg) : Math.floor(maxStock);

  // effectiveMax: bags for BOLSA, kg for loose.
  const effectiveMax =
    saleMode === "BOLSA_CERRADA" ? maxBags : maxStock;

  // When switching to BOLSA_CERRADA from loose, reset qty to 1 bag.
  const setModeAndQty = (mode: SaleMode) => {
    setSaleMode(mode);
    if (mode === "BOLSA_CERRADA") {
      setQty(1);
    } else {
      setQty(0.01);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{product?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pb-20">
          {product?.image && imgSrc(product.image) && (
            <div className="flex justify-center">
              <img
                src={imgSrc(product.image)!}
                alt={product.name}
                className="h-32 w-32 object-cover rounded-lg"
              />
            </div>
          )}

          {/* Loose badge (V-01) */}
          {isLoose && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                SUELTO
              </Badge>
              <span className="text-xs text-muted-foreground">
                ${priceKgSuelto?.toFixed(2)}/kg
              </span>
            </div>
          )}

          {/* Mode switch — ONLY if loose-eligible (V-01) */}
          {isLoose && (
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(
                ["POR_PESO", "POR_MONTO", "BOLSA_CERRADA"] as SaleMode[]
              ).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={saleMode === mode}
                  className={`flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-colors ${
                    saleMode === mode
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setModeAndQty(mode);
                    if (mode === "BOLSA_CERRADA") setQty(1);
                    else if (mode === "POR_PESO") setQty(0.01);
                    else setAmount(0);
                  }}
                >
                  {LOOSE_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          )}

          {/* POR_PESO: kg input (2dp, max=decimal stock) */}
          {saleMode === "POR_PESO" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="kgInput">Kilogramos</Label>
                <Input
                  id="kgInput"
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={effectiveMax}
                  value={qty || ""}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 0.01 && v <= effectiveMax) {
                      setQty(v);
                    } else if (e.target.value === "") {
                      setQty(0);
                    }
                  }}
                  placeholder="0.00"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Stock disponible:{" "}
                <span className="font-medium text-foreground">
                  {maxStock.toFixed(2)} kg
                </span>
              </p>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  ${displayPrice.toLocaleString("es-AR")}/kg
                </span>
                <span className="text-lg font-bold tabular-nums">
                  ${total.toLocaleString("es-AR")}
                </span>
              </div>
            </>
          )}

          {/* POR_MONTO: amount input + live kg preview */}
          {saleMode === "POR_MONTO" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="amountInput">Monto ($)</Label>
                <Input
                  id="amountInput"
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={amount || ""}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) {
                      setAmount(v);
                    } else if (e.target.value === "") {
                      setAmount(0);
                    }
                  }}
                  placeholder="0.00"
                />
              </div>
              {kgPreview && (
                <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">
                    Equivale a
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-primary">
                    {kgPreview.toFixed(2)} kg
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    a ${priceKgSuelto?.toFixed(2)}/kg
                  </p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Stock disponible:{" "}
                <span className="font-medium text-foreground">
                  {maxStock.toFixed(2)} kg
                </span>
              </p>
            </>
          )}

          {/* BOLSA_CERRADA: int stepper unchanged */}
          {saleMode === "BOLSA_CERRADA" && (
            <>
              <p className="text-sm text-muted-foreground">
                Stock disponible:{" "}
                <span className="font-medium text-foreground">
                  {maxStock.toFixed(2)} kg
                </span>
              </p>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  ${displayPrice.toLocaleString("es-AR")}/kg
                </span>
                <span className="text-lg font-bold tabular-nums">
                  ${total.toLocaleString("es-AR")}
                </span>
              </div>
              <p className="text-lg font-bold">
                ${Number(product ? product.price : 0).toLocaleString("es-AR")}
              </p>

              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  disabled={qty <= 1}
                  onClick={() => setQty((q) => q - 1)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-xl font-bold tabular-nums">
                  {qty}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  disabled={qty >= effectiveMax}
                  onClick={() => setQty((q) => q + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-2">
            {saleMode !== "BOLSA_CERRADA" && (
              <p className="text-lg font-bold text-center">
                ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={onDirectSale}
              disabled={
                directSelling ||
                maxStock <= 0 ||
                (saleMode === "POR_MONTO" && amount <= 0) ||
                (saleMode === "POR_PESO" && qty <= 0)
              }
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              {directSelling
                ? "Procesando venta..."
                : `Vender directo ($${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })})`}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={onAddToCart}
              disabled={
                directSelling ||
                (saleMode === "POR_MONTO" && amount <= 0) ||
                (saleMode === "POR_PESO" && qty <= 0)
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar al pedido
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
