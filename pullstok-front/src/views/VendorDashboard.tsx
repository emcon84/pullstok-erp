import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  X,
  ImageIcon,
  Eye,
  Barcode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useInfiniteProducts, useProductFacets } from "../components/hooks/useProducts";
import { useCreateSale } from "../components/hooks/useSales";
import { useCreateOrder } from "../components/hooks/useOrder";
import { useVendorCart, type VendorCartItem } from "../components/hooks/useVendorCart";
import { DataItem } from "../types";
import { Loader } from "../components/atoms/loader";
import { toast } from "react-toastify";
import { CartItem } from "../models/salesModel";
import { CreateOrder } from "../models/orderModel";
import { ProductDrawer } from "../components/molecules/ProductDrawer";

import { FilterChips } from "../components/molecules/FilterChips";

// ── Types ──

interface VendorDashboardProps {
  branchId: string;
}

// ── Helpers ──

const imgSrc = (image?: string) => {
  if (!image) return null;
  return image.startsWith("http") ? image : undefined;
};

const branchQty = (p: DataItem) =>
  Number(p.stocks?.[0]?.quantity ?? 0);

// Clave de sessionStorage para restaurar el filtro del listado al volver del
// scanner (la vista se desmonta al navegar a /scanner y el filtro es local).
const VENDOR_FILTER_KEY = "vendor-dashboard-filter";

interface StoredFilter {
  filter: string;
  categoryFilter: string;
  branchId: string;
}

const readStoredFilter = (branchId: string): StoredFilter | null => {
  try {
    const raw = sessionStorage.getItem(VENDOR_FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFilter;
    // Solo restauramos si la sucursal coincide (evita cruzar filtros entre
    // vendedores/sucursales que comparten la misma pestaña).
    if (parsed.branchId !== branchId) return null;
    sessionStorage.removeItem(VENDOR_FILTER_KEY);
    return parsed;
  } catch {
    return null;
  }
};

// ── Component ──

export const VendorDashboard = ({ branchId }: VendorDashboardProps) => {
  const navigate = useNavigate();
  // Restaura el filtro guardado al volver del scanner (lee y limpia UNA vez).
  const [storedFilter] = useState(() => readStoredFilter(branchId));
  const [filter, setFilter] = useState(storedFilter?.filter ?? "");
  const [categoryFilter, setCategoryFilter] = useState(
    storedFilter?.categoryFilter ?? "",
  );
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search: wait 250ms after last keystroke before querying backend
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedFilter(filter.trim());
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [filter]);

  const { items, isLoadingInitial, isFetchingNextPage, hasNextPage, loadMore } =
    useInfiniteProducts(
      branchId,
      debouncedFilter?.trim() || undefined,
      categoryFilter.trim() || undefined,
    );

  // Complete facets for the filter chips: all org categories plus variant
  // groups for the selected category. Independent of the paginated list.
  const { categories: facetsCategories, variants: facetsVariants } =
    useProductFacets(categoryFilter.trim() || undefined);

  // Infinite scroll: load the next page when the sentinel enters the viewport.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, loadMore]);
  const { createSale } = useCreateSale();
  const { submitOrder, loading: savingOrder } = useCreateOrder();
  const {
    items: cartItems,
    totalAmount,
    itemCount,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useVendorCart();

  const [qtyModal, setQtyModal] = useState<{ product: DataItem } | null>(null);
  const [qty, setQty] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // ProductDrawer for viewing stock across all branches
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<DataItem | null>(null);

  const openDrawer = useCallback((product: DataItem) => {
    setDrawerProduct(product);
    setDrawerOpen(true);
  }, []);

  // ── Quantity modal ──

  const openQtyModal = useCallback((product: DataItem) => {
    setQty(1);
    setQtyModal({ product });
  }, []);

  const [directSelling, setDirectSelling] = useState(false);

  const confirmAddToCart = () => {
    if (!qtyModal) return;
    const stock = branchQty(qtyModal.product);
    addToCart(qtyModal.product, qty, branchId, stock);
    toast.success(`"${qtyModal.product.name}" agregado al pedido`);
    setQtyModal(null);
  };

  // ── Direct sale from showroom modal (1-tap single product sale) ──
  const handleDirectSale = async () => {
    if (!qtyModal) return;
    const p = qtyModal.product;
    const stock = branchQty(p);
    if (stock <= 0) {
      toast.error("Producto sin stock");
      return;
    }
    setDirectSelling(true);
    try {
      const cart: CartItem[] = [
        {
          product: {
            _id: (p._id || p.id) as string,
            id: (p._id || p.id) as string,
            name: p.name,
            price: Number(p.price ?? 0),
            quantity: stock,
            description: "",
            category: "",
          },
          quantity: qty,
          totalPrice: Number(p.price ?? 0) * qty,
        },
      ];
      await createSale({ cart });
      toast.success(`Venta directa realizada (${qty}x "${p.name}")`);
      setQtyModal(null);
    } catch (err: any) {
      toast.error(err?.message || "Error al realizar la venta directa");
    } finally {
      setDirectSelling(false);
    }
  };

  // ── Confirm sale ──

  const handleConfirmSale = async () => {
    if (cartItems.length === 0) return;
    setConfirming(true);
    try {
      const cart: CartItem[] = cartItems.map((i) => ({
        product: {
          _id: i.productId,
          id: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.stock,
          description: "",
          category: "",
        },
        quantity: i.quantity,
        totalPrice: i.price * i.quantity,
      }));
      await createSale({ cart });
      clearCart();
      setCartOpen(false);
      toast.success("Pedido confirmado y vendido");
    } catch (err: any) {
      toast.error(err?.message || "Error al confirmar el pedido");
    } finally {
      setConfirming(false);
    }
  };

  // ── Save cart as Pending Order ──
  // Mismo shape que el pedido directo de la vista Pedidos (Orders.tsx), más el
  // branchId de la sucursal del vendedor. Sin cliente: el backend resuelve el
  // genérico "Consumidor final" de la org. Se vende después desde Pedidos
  // (conversión order → sale ya existente).
  const handleSaveOrder = () => {
    if (cartItems.length === 0) return;
    const orderPayload: CreateOrder = {
      type: "sale",
      products: cartItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.price,
      })),
      totalAmount,
      branchId,
    };
    submitOrder(orderPayload, {
      onSuccess: () => {
        clearCart();
        setCartOpen(false);
        toast.success("Pedido guardado — confirmá la venta desde Pedidos");
      },
      onError: (err: any) => {
        toast.error(err?.message || "Error al guardar el pedido");
      },
    });
  };

  // ── Product table ──
  // Memoized: only re-renders when products or cart change, not on each keystroke.
  // Mobile: card apilado con imagen+nombre+stock+acciones al centro, divisor
  // vertical y precio grande a la derecha (mismo diseño que ProductsTable).
  const productTable = useMemo(
    () => (
      <>
        {/* Product table (all breakpoints) */}
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader className="hidden sm:table-header-group">
              <TableRow className="hover:bg-transparent">
                <TableHead>Producto</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => {
                const id = p._id || p.id;
                const stock = branchQty(p);
                const inCart = cartItems.find((ci) => ci.productId === id);
                return (
                  <TableRow
                    key={id}
                    className="cursor-pointer hover:bg-muted/50 sm:table-row [&>td]:!whitespace-normal [&>td]:min-w-0"
                    onClick={() => openQtyModal(p)}
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
                              {stock <= 0 ? "Sin stock" : `${stock} u.`}
                            </Badge>
                            <div className="flex gap-0.5 shrink-0 items-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Ver stock en otras sucursales"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDrawer(p);
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
                                  sessionStorage.setItem(
                                    VENDOR_FILTER_KEY,
                                    JSON.stringify({
                                      filter,
                                      categoryFilter,
                                      branchId,
                                    } satisfies StoredFilter),
                                  );
                                  navigate(`/scanner?assignTo=${id}`);
                                }}
                              >
                                <Barcode className="h-3.5 w-3.5" />
                              </Button>
                              {inCart ? (
                                <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                                  {inCart.quantity} en pedido
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="shrink-0 h-7 px-2 text-xs"
                                  disabled={stock <= 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openQtyModal(p);
                                  }}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              )}
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
                          {stock <= 0 ? "Sin stock" : `${stock} u.`}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Ver stock en otras sucursales"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer(p);
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
                            sessionStorage.setItem(
                              VENDOR_FILTER_KEY,
                              JSON.stringify({
                                filter,
                                categoryFilter,
                                branchId,
                              } satisfies StoredFilter),
                            );
                            navigate(`/scanner?assignTo=${id}`);
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
                      {inCart ? (
                        <Badge variant="secondary" className="text-xs">
                          {inCart.quantity} en pedido
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={stock <= 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            openQtyModal(p);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </>
    ),
    [items, cartItems, openQtyModal, openDrawer, navigate, filter, categoryFilter, branchId],
  );

  // ── Loading (initial only) ──

  if (isLoadingInitial) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          Buscá productos y agregalos al pedido
        </p>
      </div>

      {/* ── Search + filters (sticky) ── */}
      <div className="sticky top-16 lg:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 space-y-4 border-b bg-background px-4 pb-3 pt-3 sm:px-6 lg:px-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10 text-lg h-12"
            placeholder="Buscar por nombre, código, categoría o variante..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
        </div>

        <FilterChips
          products={items}
          quickCategories={facetsCategories.map((c) => c.name)}
          quickVariants={facetsVariants}
          filter={filter}
          categoryFilter={categoryFilter}
          onFilterChange={setFilter}
          onCategoryChange={setCategoryFilter}
          onClear={() => { setFilter(""); setCategoryFilter(""); }}
        />
      </div>

      {/* ── Product grid ── */}
      {(items.length === 0) ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-muted-foreground">
            {filter || categoryFilter ? "Sin resultados con estos filtros." : "No hay productos."}
          </p>
          {(filter || categoryFilter) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setFilter(""); setCategoryFilter(""); }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        productTable
      )}

      {/* ── Infinite scroll: sentinel + "load more" footer ── */}
      {hasNextPage && (
        <div className="flex items-center justify-center py-6">
          {isFetchingNextPage ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader />
              <span>Cargando más…</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              Desplazate para cargar más productos
            </span>
          )}
        </div>
      )}
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />

      {/* ── Cart FAB ── */}
      {itemCount > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1">
          {/* Radar rings */}
          <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-primary/20" />
          <span className="absolute inset-0 -m-6 animate-ping rounded-full bg-primary/10 [animation-delay:300ms]" />
          {/* Button */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-lg hover:bg-primary/90 transition-all active:scale-95 touch-manipulation"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="font-semibold text-sm">{itemCount}</span>
            <span className="hidden sm:inline text-sm">
              — ${totalAmount.toLocaleString("es-AR")}
            </span>
          </button>
        </div>
      )}

      {/* ── Quantity modal ── */}
      <Dialog
        open={!!qtyModal}
        onOpenChange={(open) => !open && setQtyModal(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {qtyModal?.product.name}
            </DialogTitle>
          </DialogHeader>
    <div className="space-y-4 pb-20">
            {qtyModal?.product.image && imgSrc(qtyModal.product.image) && (
              <div className="flex justify-center">
                <img
                  src={imgSrc(qtyModal.product.image)!}
                  alt={qtyModal.product.name}
                  className="h-32 w-32 object-cover rounded-lg"
                />
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Stock disponible:{" "}
              <span className="font-medium text-foreground">
                {qtyModal ? branchQty(qtyModal.product) : 0} u.
              </span>
            </p>
            <p className="text-lg font-bold">
              ${qtyModal ? Number(qtyModal.product.price).toLocaleString("es-AR") : 0}
            </p>

            {/* Qty selector */}
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
                disabled={qtyModal ? qty >= branchQty(qtyModal.product) : true}
                onClick={() => setQty((q) => q + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="w-full"
                size="lg"
                onClick={handleDirectSale}
                disabled={directSelling || (qtyModal ? branchQty(qtyModal.product) <= 0 : true)}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                {directSelling
                  ? "Procesando venta..."
                  : `Vender directo ($${((qtyModal ? Number(qtyModal.product.price ?? 0) : 0) * qty).toLocaleString("es-AR")})`}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                size="lg"
                onClick={confirmAddToCart}
                disabled={directSelling}
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar al pedido
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cart slide-over ── */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col px-6">
          <SheetHeader className="px-0">
            <SheetTitle className="flex items-center justify-between">
              <span>Tu pedido</span>
            </SheetTitle>
          </SheetHeader>

          {cartItems.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              El pedido está vacío.
            </p>
          ) : (
            <>
              {/* Cart items */}
              <div className="flex-1 overflow-auto -mx-6 px-6 space-y-3 mt-4 mb-2">
                {cartItems.map((item) => (
                  <CartItemRow
                    key={item.productId}
                    item={item}
                    onUpdateQty={(qty) => updateQuantity(item.productId, qty)}
                    onRemove={() => removeFromCart(item.productId)}
                  />
                ))}
              </div>

              {/* Footer: total + actions */}
              <div className="border-t pt-4 space-y-3 mt-2 pb-2">
                <div className="flex items-center justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    ${totalAmount.toLocaleString("es-AR")}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      size="lg"
                      onClick={() => {
                        clearCart();
                        setCartOpen(false);
                        toast.info("Pedido cancelado");
                      }}
                      disabled={confirming || savingOrder}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      size="lg"
                      onClick={handleSaveOrder}
                      disabled={confirming || savingOrder || cartItems.length === 0}
                    >
                      {savingOrder ? "Guardando..." : "Guardar pedido"}
                    </Button>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleConfirmSale}
                    disabled={confirming || savingOrder}
                  >
                    {confirming ? "Procesando..." : "Vender directo"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Product Drawer (stock across all branches) ── */}
      <ProductDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerProduct(null);
        }}
        product={drawerProduct}
        readOnly
      />
    </div>
  );
};

// ── Cart item row ──

const CartItemRow = ({
  item,
  onUpdateQty,
  onRemove,
}: {
  item: VendorCartItem;
  onUpdateQty: (qty: number) => void;
  onRemove: () => void;
}) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">{item.name}</p>
      <p className="text-xs text-muted-foreground">
        ${item.price.toLocaleString("es-AR")} c/u
      </p>
      <p className="text-xs font-semibold">
        ${(item.price * item.quantity).toLocaleString("es-AR")}
      </p>
    </div>
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={item.quantity <= 1}
        onClick={() => onUpdateQty(item.quantity - 1)}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-8 text-center text-sm font-bold tabular-nums">
        {item.quantity}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={item.quantity >= item.stock}
        onClick={() => onUpdateQty(item.quantity + 1)}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-destructive"
      onClick={onRemove}
    >
      <X className="h-4 w-4" />
    </Button>
  </div>
);
