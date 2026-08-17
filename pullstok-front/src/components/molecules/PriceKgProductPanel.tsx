import { useEffect, useState } from "react";
import { ShoppingCart, Plus } from "lucide-react";
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
import { getLooseStock } from "@/services/looseStock";
import { round2 } from "@/lib/money";
import type { PriceKgSpecies } from "@/services/priceKgTypes";
import type { SaleMode } from "@/components/hooks/useVendorCart";

// Mismo helper que looseSaleService.looseLineName: "MARCA · TIPO" (sin el
// " · " cuando falta una de las dos partes).
const looseLineName = (brand: string, type: string): string =>
  [brand, type].filter(Boolean).join(" · ");

// Etiquetas de modo de venta suelto (sdd/precios-suelto-planilla C-06):
// replica el layout del QuantityModal del dashboard; acá solo se ofrecen los
// modos sueltos (POR_PESO / POR_MONTO), nunca bolsa cerrada.
const LOOSE_MODE_LABELS: Record<SaleMode, string> = {
  BOLSA_CERRADA: "Entero",
  POR_PESO: "Por kilo",
  POR_MONTO: "Por monto",
};

export interface CellContext {
  brandId: string;
  brandName: string;
  typeId: string;
  typeName: string;
  species: PriceKgSpecies;
  priceKg: number | null;
  /** Id de la celda PriceKgPrice (loosePriceId): lo manda la venta suelta. */
  cellId?: string | null;
}

interface PriceKgProductPanelProps {
  open: boolean;
  onClose: () => void;
  cell: CellContext | null;
  /** Sucursal del contexto (VENDEDOR/CASHIER asignado). Sin sucursal no se
   *  puede leer el stock suelto por sucursal → se muestra "—". */
  branchId?: string | null;
  onSellDirect: (
    qty: number,
    mode: SaleMode,
    amount: number,
  ) => void | Promise<void>;
  onAddToCart: (qty: number, mode: SaleMode, amount: number) => void;
}

/**
 * Item de venta armado con el precio de la CELDA (helper puro y testeable).
 * Shape compatible con CartItem (models/salesModel): useSales/useCreateSale lo
 * mapea a { loosePriceId, looseName, quantity, name, price, category, saleMode }
 * sin mandar productId cuando hay celda (loose-lines-stock).
 */
export interface CellSaleItem {
  product: {
    _id: string;
    id: string;
    name: string;
    price: number;
    quantity: number;
    description: string;
    category: string;
  };
  quantity: number;
  totalPrice: number;
  saleMode: SaleMode;
  /** Id de la celda PriceKgPrice: identifica la línea suelta en el backend
   *  (loose-lines-stock). Presente cuando el item sale de una celda. */
  loosePriceId?: string;
  /** Nombre de la línea ("MARCA · TIPO"), fallback de display del backend. */
  looseName?: string;
}

/**
 * Arma el item de una venta suelta con la CELDA como única fuente: el precio
 * es SIEMPRE cell.priceKg (C-05), el nombre es la línea "MARCA · TIPO" y, con
 * cellId, el backend identifica la línea por loosePriceId SIN productId. Sin
 * cellId cae a productId vacío (fallback razonable).
 */
export const buildCellSaleItem = (
  cell: Pick<CellContext, "priceKg" | "cellId" | "brandName" | "typeName">,
  qty: number,
  mode: SaleMode,
  amount: number,
): CellSaleItem => {
  const lineName = looseLineName(cell.brandName, cell.typeName);
  const pid = cell.cellId ?? "";
  const quantity = mode === "POR_MONTO" ? amount : qty;
  const totalPrice =
    mode === "POR_MONTO" ? amount : round2((cell.priceKg ?? 0) * qty);
  return {
    product: {
      _id: pid,
      id: pid,
      name: lineName,
      // La celda manda: NUNCA un priceKgSuelto de producto (C-05).
      price: cell.priceKg ?? 0,
      quantity: 0,
      description: "",
      category: "",
    },
    quantity,
    totalPrice,
    saleMode: mode,
    // Con id de celda la venta suelta identifica la línea por loosePriceId y
    // el backend descuenta los kg del LooseStock de esa celda.
    ...(cell.cellId
      ? {
          loosePriceId: cell.cellId,
          looseName: lineName,
        }
      : {}),
  };
};

export const PriceKgProductPanel = ({
  open,
  onClose,
  cell,
  branchId,
  onSellDirect,
  onAddToCart,
}: PriceKgProductPanelProps) => {
  const [looseStockKg, setLooseStockKg] = useState<number | null>(null);
  const [mode, setMode] = useState<SaleMode>("POR_PESO");
  const [qty, setQty] = useState(0.01);
  const [amount, setAmount] = useState(0);
  const [selling, setSelling] = useState(false);

  const cellPrice = cell?.priceKg ?? null;
  const lineName = cell
    ? looseLineName(cell.brandName, cell.typeName)
    : "";
  const speciesLabel =
    cell?.species === "PERRO"
      ? "Perros"
      : cell?.species === "GATO"
        ? "Gatos"
        : "Perros y gatos";

  // Stock suelto en kg de la celda para la sucursal del vendedor. Sin sucursal
  // (ADMIN org-wide) no hay stock por sucursal que mostrar → null → "—". El
  // estado de la venta (modo/qty/monto) arranca limpio en cada mount: el padre
  // remontea el panel con key=cellId, no reseteamos estado tras prop changes.
  useEffect(() => {
    if (!open || !cell || cell.priceKg === null || !cell.cellId || !branchId) {
      setLooseStockKg(null);
      return;
    }
    let cancelled = false;
    setLooseStockKg(null);
    getLooseStock(cell.cellId, branchId)
      .then((line) => {
        if (!cancelled) setLooseStockKg(line?.quantity ?? 0);
      })
      .catch(() => {
        if (!cancelled) setLooseStockKg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, cell, branchId]);

  // Preview de la venta con el precio de la celda.
  const kgPreview =
    mode === "POR_MONTO" && cellPrice && amount > 0
      ? round2(amount / cellPrice)
      : null;
  const total =
    mode === "POR_MONTO"
      ? amount
      : cellPrice
        ? round2(cellPrice * qty)
        : 0;

  // Stock suelto CARGADO y en CERO con sucursal: el backend rechaza la venta
  // (salesService: looseStock.quantity < kg → "Stock suelto insuficiente"),
  // así que se bloquea VENDER y se avisa. Sin sucursal / sin lectura → null →
  // "—" y se permite (lo resuelve el backend).
  const noLooseStock = !!branchId && looseStockKg === 0;
  const effectiveMax = looseStockKg ?? undefined;

  const sellDisabled =
    !cellPrice ||
    noLooseStock ||
    selling ||
    (mode === "POR_PESO" && qty <= 0) ||
    (mode === "POR_MONTO" && amount <= 0);

  const handleSell = async () => {
    if (sellDisabled) return;
    setSelling(true);
    try {
      await onSellDirect(mode === "POR_MONTO" ? 0 : qty, mode, amount);
    } finally {
      setSelling(false);
    }
  };

  const stockLine = (
    <p className="text-sm text-muted-foreground">
      Stock disponible:{" "}
      <span className="font-medium text-foreground">
        {looseStockKg === null ? "—" : `${looseStockKg.toFixed(2)} kg`}
      </span>
    </p>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{lineName}</DialogTitle>
        </DialogHeader>

        {!cell ? null : cellPrice === null ? (
          /* Celda sin precio: no hay nada que vender (C-06). */
          <div className="space-y-4 pt-4">
            <div className="rounded-lg bg-muted/50 border p-4 text-center">
              <p className="font-medium">Sin precio en planilla</p>
              <p className="text-sm text-muted-foreground mt-1">
                Esta celda no tiene precio por kilo cargado. Cargalo en la
                planilla para poder vender suelto desde acá.
              </p>
            </div>
            <Button
              className="w-full"
              disabled
              title="La celda no tiene precio en la planilla"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Vender directo
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pb-20">
            {/* Contexto de la celda */}
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <Badge variant="secondary" className="text-xs">
                  {speciesLabel}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Stock suelto:{" "}
                  <span className="font-semibold text-foreground">
                    {looseStockKg === null
                      ? "—"
                      : `${looseStockKg.toFixed(2)} kg`}
                  </span>
                  {noLooseStock && (
                    <span className="block font-medium text-destructive mt-1">
                      Sin stock suelto cargado
                    </span>
                  )}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs shrink-0">
                ${cellPrice.toLocaleString("es-AR")}/kg
              </Badge>
            </div>

            {/* Selector de modo suelto (solo POR_PESO / POR_MONTO) */}
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(["POR_PESO", "POR_MONTO"] as SaleMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  className={`flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-colors ${
                    mode === m
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setMode(m);
                    if (m === "POR_PESO") setQty(0.01);
                    else setAmount(0);
                  }}
                >
                  {LOOSE_MODE_LABELS[m]}
                </button>
              ))}
            </div>

            {mode === "POR_PESO" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="panelKg">Kilogramos</Label>
                  <Input
                    id="panelKg"
                    type="number"
                    step="0.01"
                    min={0.01}
                    max={effectiveMax}
                    value={qty || ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v >= 0.01) setQty(v);
                      else if (e.target.value === "") setQty(0);
                    }}
                    placeholder="0.00"
                  />
                </div>
                {stockLine}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    ${cellPrice.toLocaleString("es-AR")}/kg
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="panelAmount">Monto ($)</Label>
                  <Input
                    id="panelAmount"
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={amount || ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) setAmount(v);
                      else if (e.target.value === "") setAmount(0);
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
                      a $
                      {cellPrice.toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })}
                      /kg
                    </p>
                  </div>
                )}
                {stockLine}
              </>
            )}

            {/* Acciones */}
            <div className="flex flex-col gap-2 pt-2">
              <p className="text-lg font-bold text-center">
                ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
              <Button className="w-full" size="lg" disabled={sellDisabled} onClick={handleSell}>
                <ShoppingCart className="h-4 w-4 mr-2" />
                {selling
                  ? "Procesando venta..."
                  : `Vender directo ($${total.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                    })})`}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                size="lg"
                disabled={
                  selling ||
                  (mode === "POR_MONTO" && amount <= 0) ||
                  (mode === "POR_PESO" && qty <= 0)
                }
                onClick={() =>
                  onAddToCart(mode === "POR_MONTO" ? 0 : qty, mode, amount)
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar al pedido
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};