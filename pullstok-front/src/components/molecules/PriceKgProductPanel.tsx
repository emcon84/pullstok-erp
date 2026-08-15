import { useEffect, useMemo, useState } from "react";
import { Search, Plus, ShoppingCart, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Pagination } from "@/components/molecules/pagination";
import { listProductsForCell, CellProduct } from "@/services/priceKgReview";
import { round2 } from "@/lib/money";
import type { PriceKgSpecies } from "@/services/priceKgTypes";
import type { SaleMode } from "@/components/hooks/useVendorCart";

/**
 * Panel de venta suelta de una celda de la planilla (sdd/precios-suelto-planilla).
 * Abre desde una celda con precio válido en PriceKgLookup: lista los productos
 * que matchean la celda (GET /price-kg-products), permite buscar/paginar
 * (numbered, 10 por página) y vender por kilo o por monto. El precio de la
 * VENTA es SIEMPRE el de la celda (cell.priceKg), no el priceKgSuelto que el
 * producto tenga guardado: la planilla es la fuente autoritativa (C-05).
 */

export interface CellContext {
  brandId: string;
  brandName: string;
  typeId: string;
  typeName: string;
  species: PriceKgSpecies;
  priceKg: number | null;
}

interface PriceKgProductPanelProps {
  open: boolean;
  onClose: () => void;
  cell: CellContext | null;
  onSellDirect: (
    product: CellProduct,
    qty: number,
    mode: SaleMode,
    amount: number,
  ) => void;
  onAddToCart: (
    product: CellProduct,
    qty: number,
    mode: SaleMode,
    amount: number,
  ) => void;
  onCreateProduct: () => void;
}

/** Item de venta armado con el precio de la CELDA (helper puro y testeable). */
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
}

export const buildCellSaleItem = (
  product: { _id?: string; id?: string; name: string; priceKgSuelto?: number | null },
  qty: number,
  mode: SaleMode,
  amount: number,
  cellPrice: number,
): CellSaleItem => {
  const pid = (product._id || product.id || "") as string;
  const quantity = mode === "POR_MONTO" ? amount : qty;
  const totalPrice = mode === "POR_MONTO" ? amount : round2(cellPrice * qty);
  return {
    product: {
      _id: pid,
      id: pid,
      name: product.name,
      // La celda manda: NUNCA product.priceKgSuelto (C-05).
      price: cellPrice,
      quantity: 0,
      description: "",
      category: "",
    },
    quantity,
    totalPrice,
    saleMode: mode,
  };
};

const PAGE_SIZE = 10;

export const PriceKgProductPanel = ({
  open,
  onClose,
  cell,
  onSellDirect,
  onAddToCart,
  onCreateProduct,
}: PriceKgProductPanelProps) => {
  const [products, setProducts] = useState<CellProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<SaleMode>("POR_PESO");
  const [qty, setQty] = useState(0.01);
  const [amount, setAmount] = useState(0);

  const cellPrice = cell?.priceKg ?? null;

  // Carga los productos de la celda al abrir (solo si la celda tiene precio).
  useEffect(() => {
    if (!open || !cell || cell.priceKg === null) return;
    setLoading(true);
    setProducts([]);
    setSearch("");
    setPage(1);
    setSelectedId(null);
    setMode("POR_PESO");
    setQty(0.01);
    setAmount(0);
    listProductsForCell({
      brandId: cell.brandId,
      typeId: cell.typeId,
      species: cell.species,
    })
      .then((items) => setProducts(items))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [open, cell]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = products.find((p) => p.id === selectedId) ?? null;

  // Preview de la venta con el precio de la celda.
  const kgEquiv =
    mode === "POR_MONTO" && cellPrice && amount > 0
      ? round2(amount / cellPrice)
      : null;
  const total =
    mode === "POR_MONTO"
      ? amount
      : cellPrice
        ? round2(cellPrice * qty)
        : 0;

  const sellDisabled =
    !selected ||
    !cellPrice ||
    loading ||
    (mode === "POR_PESO" && qty <= 0) ||
    (mode === "POR_MONTO" && amount <= 0);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Venta suelta — celda</SheetTitle>
        </SheetHeader>

        {!cell ? null : cell.priceKg === null ? (
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
          <div className="space-y-4 pt-4">
            {/* Contexto de la celda */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">
                  {cell.brandName} · {cell.typeName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {cell.species === "PERRO"
                    ? "Perros"
                    : cell.species === "GATO"
                      ? "Gatos"
                      : "Perros y gatos"}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                ${cellPrice.toLocaleString("es-AR")}/kg
              </Badge>
            </div>

            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>

            {/* Lista de productos que matchean la celda */}
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Cargando productos...
              </p>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg bg-muted/50 border p-4 text-center space-y-3">
                <PackageOpen className="h-6 w-6 mx-auto text-muted-foreground" />
                <p className="text-sm">
                  Sin productos que matcheen esta celda
                </p>
                <Button variant="outline" size="sm" onClick={onCreateProduct}>
                  <Plus className="h-4 w-4 mr-1" />
                  Crear producto
                </Button>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {visible.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        aria-pressed={selectedId === p.id}
                        onClick={() => setSelectedId(p.id)}
                        className="w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/50 aria-pressed:bg-muted aria-pressed:border-primary/40"
                      >
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-between">
                          <span>
                            {p.weightKg ? `${p.weightKg} kg` : "Peso no cargado"}
                          </span>
                          <span>Stock: {p.stock}</span>
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </>
            )}

            {/* Modo y cantidad */}
            {selected && (
              <div className="space-y-4">
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
                      onClick={() => setMode(m)}
                    >
                      {m === "POR_PESO" ? "Por kilo" : "Por monto"}
                    </button>
                  ))}
                </div>

                {mode === "POR_PESO" ? (
                  <div className="space-y-2">
                    <Label htmlFor="panelKg">Kilogramos</Label>
                    <Input
                      id="panelKg"
                      type="number"
                      step="0.01"
                      min={0.01}
                      value={qty || ""}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v > 0) setQty(v);
                        else if (e.target.value === "") setQty(0);
                      }}
                      placeholder="0.00"
                    />
                  </div>
                ) : (
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
                    {kgEquiv !== null && (
                      <p className="text-sm text-muted-foreground">
                        Equivale a{" "}
                        <span className="font-semibold text-foreground">
                          {kgEquiv.toFixed(2)} kg
                        </span>{" "}
                        a ${cellPrice.toLocaleString("es-AR")}/kg
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    ${cellPrice.toLocaleString("es-AR")}/kg
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}

            {/* Acciones */}
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                size="lg"
                disabled={sellDisabled}
                onClick={() =>
                  selected &&
                  onSellDirect(selected, mode === "POR_MONTO" ? 0 : qty, mode, amount)
                }
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Vender directo
              </Button>
              <Button
                variant="outline"
                className="w-full"
                size="lg"
                disabled={sellDisabled}
                onClick={() =>
                  selected &&
                  onAddToCart(selected, mode === "POR_MONTO" ? 0 : qty, mode, amount)
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar al pedido
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};