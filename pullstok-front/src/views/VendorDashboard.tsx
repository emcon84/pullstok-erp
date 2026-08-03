import { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  X,
  Package,
  ImageIcon,
  Eye,
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
import { useProducts } from "../components/hooks/useProducts";
import { useCreateSale } from "../components/hooks/useSales";
import { useVendorCart, type VendorCartItem } from "../components/hooks/useVendorCart";
import { DataItem } from "../types";
import { Loader } from "../components/atoms/loader";
import { toast } from "react-toastify";
import { CartItem } from "../models/salesModel";
import { ProductDrawer } from "../components/molecules/ProductDrawer";

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

// ── Component ──

export const VendorDashboard = ({ branchId }: VendorDashboardProps) => {
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search: wait 250ms after last keystroke before querying backend
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedFilter(filter);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [filter]);

  const { products, loading } = useProducts(branchId, debouncedFilter || undefined);
  const { createSale } = useCreateSale();
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

  const openDrawer = (product: DataItem) => {
    setDrawerProduct(product);
    setDrawerOpen(true);
  };

  // ── Quantity modal ──

  const openQtyModal = (product: DataItem) => {
    setQty(1);
    setQtyModal({ product });
  };

  const confirmAddToCart = () => {
    if (!qtyModal) return;
    const stock = branchQty(qtyModal.product);
    addToCart(qtyModal.product, qty, branchId, stock);
    toast.success(`"${qtyModal.product.name}" agregado al pedido`);
    setQtyModal(null);
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

  // ── Loading ──

  if (loading) {
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

      {/* ── Search ── */}
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

      {/* ── Product grid ── */}
      {(!products || products.length === 0) ? (
        <p className="py-12 text-center text-muted-foreground">
          {filter ? "Sin resultados." : "No hay productos."}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const id = p._id || p.id;
                  const stock = branchQty(p);
                  const inCart = cartItems.find((ci) => ci.productId === id);
                  return (
                    <TableRow
                      key={id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openQtyModal(p)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
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
                          <div className="min-w-0">
                            <p className="font-medium leading-tight">{p.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {p.code || "—"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
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
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        ${Number(p.price).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell>
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

          {/* Mobile cards */}
          <div className="md:hidden grid grid-cols-2 gap-3">
            {products.map((p) => {
              const id = p._id || p.id;
              const stock = branchQty(p);
              const inCart = cartItems.find((ci) => ci.productId === id);
              return (
                <Card
                  key={id}
                  className={cn(
                    "p-3 cursor-pointer active:scale-[0.98] transition-transform",
                    stock <= 0 && "opacity-50",
                  )}
                  onClick={() => stock > 0 && openQtyModal(p)}
                >
                  <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-muted mb-2">
                    {imgSrc(p.image) ? (
                      <img
                        src={imgSrc(p.image)!}
                        alt={p.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>
                  <p className="text-sm font-medium leading-tight line-clamp-2">
                    {p.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {p.code || "—"}
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-sm font-bold tabular-nums">
                      ${Number(p.price).toLocaleString("es-AR")}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5",
                        stock <= 0
                          ? "border-destructive/30 text-destructive"
                          : "border-emerald-300 text-emerald-700",
                      )}
                    >
                      {stock <= 0 ? "Sin stock" : stock}
                    </Badge>
                  </div>
                  <button
                    className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1 text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDrawer(p);
                    }}
                  >
                    <Eye className="h-3 w-3" />
                    Ver stock
                  </button>
                  {inCart && (
                    <Badge variant="secondary" className="mt-1.5 text-[10px] w-full justify-center">
                      {inCart.quantity} en pedido
                    </Badge>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* ── Cart FAB ── */}
      {itemCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1">
          {/* Radar rings */}
          <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-primary/20" />
          <span className="absolute inset-0 -m-6 animate-ping rounded-full bg-primary/10 [animation-delay:300ms]" />
          {/* Button */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-lg hover:bg-primary/90 transition-all active:scale-95"
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
          <div className="space-y-4">
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

            <Button className="w-full" size="lg" onClick={confirmAddToCart}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar al pedido
            </Button>
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
                    disabled={confirming}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    size="lg"
                    onClick={handleConfirmSale}
                    disabled={confirming}
                  >
                    {confirming ? "Procesando..." : "Confirmar pedido"}
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
