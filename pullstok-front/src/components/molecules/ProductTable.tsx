import { memo } from "react";
import { Plus, ImageIcon, Eye, Barcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { imgSrc, branchQty, stockUnitLabel } from "@/components/hooks/vendorCatalogHelpers";
import type { DataItem } from "@/types";
import type { VendorCartItem } from "@/components/hooks/useVendorCart";

export interface InlineQtyProps {
  /** Valor (string) del input de cantidad de una fila. */
  value: (index: number) => string;
  onChange: (index: number, value: string) => void;
  /** Confirma (Enter/click) la fila: la agrega al pedido. */
  onCommit: (index: number) => void;
  registerInput: (index: number, el: HTMLInputElement | null) => void;
  disabled: (index: number) => boolean;
}

interface ProductTableProps {
  items: DataItem[];
  cartItems: VendorCartItem[];
  selectedIndex: number;
  registerRow: (index: number, el: HTMLTableRowElement | null) => void;
  onRowClick: (index: number, product: DataItem) => void;
  onOpenDrawer: (product: DataItem) => void;
  onAssignBarcode: (product: DataItem) => void;
  /** Abre el modal de cantidad (solo flujo legacy VendorDashboard). */
  onOpenQty?: (product: DataItem) => void;
  /** Input de cantidad INLINE del POS unificado. Si está presente, reemplaza
   *  el botón +/modal de la fila por un input editable + botón de agregar. */
  inlineQty?: InlineQtyProps;
}

// Presentacional: sólo renderiza la tabla. Memoizada para no re-renderizar en
// cada tecla del buscador (sólo cuando cambian items/carrito/selección).
// Mobile: card apilado con imagen+nombre+stock+acciones al centro, divisor
// vertical y precio grande a la derecha (mismo diseño que ProductsTable).
export const ProductTable = memo(
  ({
    items,
    cartItems,
    selectedIndex,
    registerRow,
    onRowClick,
    onOpenDrawer,
    onAssignBarcode,
    onOpenQty,
    inlineQty,
  }: ProductTableProps) => {
    const hasInline = !!inlineQty;

    const qtyCell = (index: number, p: DataItem, compact: boolean) => {
      const id = p._id || p.id;
      const inCart = cartItems.find((ci) => ci.productId === id);
      if (inlineQty) {
        return (
          <div className={cn("flex items-center gap-1.5", compact ? "justify-end" : "justify-end")}>
            {inCart && (
              <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                {inCart.quantity} en pedido
              </Badge>
            )}
            <Input
              ref={(el) => inlineQty.registerInput(index, el)}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={inlineQty.value(index)}
              onChange={(e) => inlineQty.onChange(index, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  inlineQty.onCommit(index);
                }
              }}
              disabled={inlineQty.disabled(index)}
              className={cn("h-8 text-center", compact ? "w-12" : "w-14")}
            />
            <Button
              size={compact ? "icon" : "sm"}
              variant="outline"
              className={compact ? "h-7 w-7 shrink-0" : "shrink-0 h-7 px-2 text-xs"}
              disabled={inlineQty.disabled(index)}
              onClick={(e) => {
                e.stopPropagation();
                inlineQty.onCommit(index);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      }
      return inCart ? (
        <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
          {inCart.quantity} en pedido
        </Badge>
      ) : (
        <Button
          size={compact ? "sm" : "sm"}
          variant="outline"
          className={compact ? "shrink-0 h-7 px-2 text-xs" : "h-7 px-2 text-xs shrink-0"}
          disabled={branchQty(p) <= 0}
          onClick={(e) => {
            e.stopPropagation();
            onOpenQty?.(p);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      );
    };

    return (
      <>
        {/* Product table (all breakpoints) */}
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader className="hidden sm:table-header-group">
              <TableRow className="hover:bg-transparent">
                <TableHead>Producto</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className={cn(hasInline ? "w-[180px]" : "w-[100px]")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p, index) => {
                const id = p._id || p.id;
                const stock = branchQty(p);
                const isSelected = index === selectedIndex;
                return (
                  <TableRow
                    key={id}
                    ref={(el) => {
                      registerRow(index, el);
                    }}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50 sm:table-row [&>td]:!whitespace-normal [&>td]:min-w-0 transition-all",
                      isSelected && "bg-primary/10 ring-2 ring-primary/60 dark:bg-primary/20",
                    )}
                    onClick={() => onRowClick(index, p)}
                  >
                    {/* Celda "producto". Mobile: card apilado. Desktop: fila clásica. */}
                    <TableCell className="p-0 sm:table-cell sm:p-2">
                      <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-0 sm:py-0 w-full max-w-full overflow-hidden">
                        {/* Imagen — fija en mobile y desktop */}
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted sm:h-10 sm:w-10">
                          {imgSrc(p.image) ? (
                            <img
                              src={imgSrc(p.image)!}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>

                        {/* Centro: nombre (con scroll horizontal interno si desborda) + stock + acciones */}
                        <div className="min-w-0 flex-1 overflow-hidden flex flex-col justify-center">
                          {/* Desktop: nombre simple */}
                          <p className="hidden font-medium leading-tight sm:block">{p.name}</p>

                          {/* Mobile: nombre se cae en 2 renglones (con scroll vertical interno si es super largo) */}
                          <div className="max-h-10 overflow-y-auto break-words text-sm font-medium leading-tight sm:hidden scrollbar-none">
                            {p.name}
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono leading-none mt-0.5">{p.code || "—"}</p>

                          {/* Mobile: stock + acciones en la misma fila */}
                          <div className="mt-1 flex items-center justify-between gap-1.5 overflow-x-auto scrollbar-none sm:hidden">
                            <Badge
                              variant="outline"
                              className={cn(
                                "shrink-0 font-medium text-[11px] px-1.5 py-0",
                                stock <= 0
                                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-700",
                              )}
                            >
                              {stock <= 0 ? "Sin stock" : `${stock} ${stockUnitLabel(p)}`}
                            </Badge>
                            <div className="flex gap-0.5 shrink-0 items-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Ver stock en otras sucursales"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenDrawer(p);
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Asignar código de barras"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAssignBarcode(p);
                                }}
                              >
                                <Barcode className="h-3.5 w-3.5" />
                              </Button>
                              {qtyCell(index, p, true)}
                            </div>
                          </div>
                        </div>

                        {/* Derecha (mobile): divisor vertical + precio con ancho fijo garantizado */}
                        <div className="flex shrink-0 w-[82px] min-w-[82px] flex-col justify-center items-end border-l pl-2 text-right sm:hidden">
                          <p className="text-sm font-semibold tabular-nums leading-tight">
                            ${Number(p.price ?? 0).toLocaleString("es-AR")}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Columnas desktop — ocultas en mobile */}
                    <TableCell className="hidden text-center sm:table-cell">
                      <div className="flex items-center justify-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            stock <= 0
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : "border-emerald-300 bg-emerald-50 text-emerald-700",
                          )}
                        >
                          {stock <= 0 ? "Sin stock" : `${stock} ${stockUnitLabel(p)}`}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Ver stock en otras sucursales"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDrawer(p);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Asignar código de barras"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAssignBarcode(p);
                          }}
                        >
                          <Barcode className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell">
                      ${Number(p.price ?? 0).toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {qtyCell(index, p, false)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </>
    );
  },
);
