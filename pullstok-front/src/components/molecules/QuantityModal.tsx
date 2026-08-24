import { useState, type Dispatch, type SetStateAction } from "react";
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
import { usePayments } from "@/components/hooks/usePayments";
import { PaymentSection } from "@/components/molecules/PaymentSection";
import type { DataItem } from "@/types";
import type { SaleMode } from "@/components/hooks/useVendorCart";
import type { PaymentInput } from "@/models/cashSessionModel";

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
  allowLoose?: boolean;
  onDirectSale: (payments: PaymentInput[], discountPct?: number) => void;
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
  allowLoose = true,
  onDirectSale,
  onAddToCart,
  onClose,
}: QuantityModalProps) => {
  const isLoose = allowLoose && (product?.priceKgSuelto ?? 0) > 0;
  // En el contexto "Por unidad" (allowLoose=false) se vende SOLO bolsa
  // cerrada: el modo viene del padre pero se lo fuerza acá para que el
  // suelto (por kilo/monto) jamás se ofrezca.
  const effectiveSaleMode: SaleMode = allowLoose ? saleMode : "BOLSA_CERRADA";
  const priceKgSuelto = product?.priceKgSuelto ?? null;
  // kg preview (POR_MONTO only)
  const kgPreview =
    effectiveSaleMode === "POR_MONTO" && priceKgSuelto && amount > 0
      ? round2(amount / priceKgSuelto)
      : null;

  // Price to display: POR_PESO / POR_MONTO shows priceKgSuelto; BOLSA shows unit price.
  const displayPrice =
    effectiveSaleMode === "BOLSA_CERRADA"
      ? Number(product?.price ?? 0)
      : (priceKgSuelto ?? 0);

  const total =
    effectiveSaleMode === "POR_MONTO"
      ? amount
      : round2(displayPrice * (effectiveSaleMode === "POR_PESO" ? qty : qty));

  // Descuento % a nivel venta (sdd/venta-descuento): total = subtotal − pct.
  const [discountPct, setDiscountPct] = useState(0);
  const discountAmount = round2((total * discountPct) / 100);
  const discountedTotal = round2(total - discountAmount);

  // Display stock per mode: ProductStock.quantity es SIEMPRE en unidades
  // (bolsas) tras la migración a stock por bolsas. El suelto en kg vive en
  // LooseStock y se muestra en el panel de celdas / Stock suelto.
  const maxBags = Math.floor(maxStock);

  // effectiveMax: bolsas para BOLSA_CERRADA; para POR_PESO/POR_MONTO también
  // son unidades (bolsas) tras la migración.
  const effectiveMax =
    effectiveSaleMode === "BOLSA_CERRADA" ? maxBags : maxStock;

  // When switching to BOLSA_CERRADA from loose, reset qty to 1 bag.
  const setModeAndQty = (mode: SaleMode) => {
    setSaleMode(mode);
    if (mode === "BOLSA_CERRADA") {
      setQty(1);
    } else {
      setQty(0.01);
    }
  };

  // Medio de pago de la venta directa (R6-R8, R10).
  const pay = usePayments(discountedTotal);

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
                  aria-pressed={effectiveSaleMode === mode}
                  className={`flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-colors ${
                    effectiveSaleMode === mode
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
          {effectiveSaleMode === "POR_PESO" && (
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
                  {maxBags} u.
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
          {effectiveSaleMode === "POR_MONTO" && (
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
                  {maxBags} u.
                </span>
              </p>
            </>
          )}

          {/* BOLSA_CERRADA: int stepper unchanged */}
          {effectiveSaleMode === "BOLSA_CERRADA" && (
            <>
              <p className="text-sm text-muted-foreground">
                Stock disponible:{" "}
                <span className="font-medium text-foreground">
                  {maxBags} u.
                </span>
              </p>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  ${displayPrice.toLocaleString("es-AR")}/u.
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

          {/* Descuento % a nivel venta */}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="qm-discount" className="shrink-0">
              Descuento (%)
            </Label>
            <Input
              id="qm-discount"
              type="number"
              min={0}
              max={100}
              step="1"
              value={discountPct}
              onChange={(e) => {
                const raw = Number(e.target.value);
                setDiscountPct(
                  Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0,
                );
              }}
              className="w-28"
            />
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">
                ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Descuento</span>
                <span className="tabular-nums">
                  −${discountAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">
                ${discountedTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <PaymentSection
            idPrefix="qm"
            payments={pay.payments}
            selectedMethod={pay.selectedMethod}
            setSelectedMethod={pay.setSelectedMethod}
            cashReceived={pay.cashReceived}
            setCashReceived={pay.setCashReceived}
            addPayment={pay.addPayment}
            clearPayments={pay.clearPayments}
            total={discountedTotal}
          />

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-2">
            {effectiveSaleMode !== "BOLSA_CERRADA" && (
              <p className="text-lg font-bold text-center">
                ${discountedTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={() => onDirectSale(pay.finalize(), discountPct)}
              disabled={
                directSelling ||
                maxStock <= 0 ||
                (effectiveSaleMode === "POR_MONTO" && amount <= 0) ||
                (effectiveSaleMode === "POR_PESO" && qty <= 0)
              }
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              {directSelling
                ? "Procesando venta..."
                : `Vender directo ($${discountedTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })})`}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={onAddToCart}
              disabled={
                directSelling ||
                (effectiveSaleMode === "POR_MONTO" && amount <= 0) ||
                (effectiveSaleMode === "POR_PESO" && qty <= 0)
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
