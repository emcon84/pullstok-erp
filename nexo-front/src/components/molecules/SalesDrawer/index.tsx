import React, { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProductSelector } from "../ProductSelector";
import { ProductsProps } from "../../../models/productsModel";
import { Customer } from "../../../models/customerModel";
import { CartItem } from "../../../models/salesModel";
import { Order } from "../../../models/orderModel";
import { toast } from "react-toastify";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

interface SalesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductsProps[];
  customers?: Customer[];
  orders?: Order[];
  title: string;
  requireCustomer?: boolean;
  allowOrderSelection?: boolean;
  onConfirm: (cart: CartItem[], customerId?: string, orderId?: string) => void;
}

export const SalesDrawer: React.FC<SalesDrawerProps> = ({
  isOpen,
  onClose,
  products,
  customers,
  orders,
  title,
  requireCustomer = false,
  allowOrderSelection = false,
  onConfirm,
}) => {
  const [mode, setMode] = useState<"products" | "order">("products");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

  useEffect(() => {
    if (mode === "order" && selectedOrder && orders) {
      const order = orders.find((o) => (o._id || o.id) === selectedOrder);
      if (order && order.items) {
        const cartItems: CartItem[] = order.items
          .filter((item) => item.product !== null)
          .map((item) => ({
            product: item.product as ProductsProps,
            quantity: item.quantity,
            totalPrice:
              (item.price || item.product?.price || 0) * item.quantity,
          }));
        setCart(cartItems);
      }
    } else if (mode === "products") {
      setCart([]);
    }
  }, [selectedOrder, mode, orders]);

  const handleProductsSelected = (
    selectedProducts: { product: ProductsProps; quantity: number }[],
  ) => {
    const newCartItems: CartItem[] = selectedProducts.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      totalPrice: (Number(item.product.price) || 0) * item.quantity,
    }));
    setCart((prev) => [...prev, ...newCartItems]);
  };

  const handleRemoveItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const resetState = () => {
    setCart([]);
    setSelectedCustomer("");
    setSelectedOrder("");
    setMode("products");
  };

  const handleConfirm = () => {
    if (cart.length === 0) {
      toast.error("Debes agregar al menos un producto o seleccionar un pedido");
      return;
    }
    if (requireCustomer && !selectedCustomer && mode === "products") {
      toast.error("Debes seleccionar un cliente");
      return;
    }
    if (mode === "order" && !selectedOrder) {
      toast.error("Debes seleccionar un pedido");
      return;
    }
    onConfirm(cart, selectedCustomer, selectedOrder);
    resetState();
    onClose();
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        >
          <SheetHeader className="border-b p-5">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {allowOrderSelection && (
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                <button
                  className={cn(
                    "rounded-md py-2 text-sm font-medium transition-colors",
                    mode === "products"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setMode("products")}
                >
                  Agregar productos
                </button>
                <button
                  className={cn(
                    "rounded-md py-2 text-sm font-medium transition-colors",
                    mode === "order"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setMode("order")}
                >
                  Desde pedido
                </button>
              </div>
            )}

            {mode === "order" && allowOrderSelection && orders && (
              <div className="space-y-2">
                <Label htmlFor="order-select">Seleccionar pedido</Label>
                <select
                  id="order-select"
                  className={selectClass}
                  value={selectedOrder}
                  onChange={(e) => setSelectedOrder(e.target.value)}
                >
                  <option value="" disabled>
                    Seleccione un pedido
                  </option>
                  {orders.map((order) => {
                    const id = order._id || order.id || "";
                    return (
                      <option key={id} value={id}>
                        {order.receipt} - {order.customer?.name || "Sin cliente"}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {mode === "products" && requireCustomer && customers && (
              <div className="space-y-2">
                <Label htmlFor="customer-select">Seleccionar cliente</Label>
                <select
                  id="customer-select"
                  className={selectClass}
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                >
                  <option value="" disabled>
                    Seleccione un cliente
                  </option>
                  {customers.map((customer) => {
                    const id = customer._id || customer.id || "";
                    return (
                      <option key={id} value={id}>
                        {customer.name}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Productos</Label>
                {mode === "products" && (
                  <Button
                    size="sm"
                    onClick={() => setIsProductSelectorOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Agregar productos
                  </Button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="font-medium">No hay productos agregados</p>
                  <p className="text-sm text-muted-foreground">
                    {mode === "products"
                      ? 'Tocá "Agregar productos" para comenzar'
                      : "Seleccioná un pedido para ver sus productos"}
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="w-16 px-3 py-2 text-center font-medium">
                          Cant.
                        </th>
                        <th className="py-2 text-left font-medium">Producto</th>
                        <th className="py-2 text-right font-medium">Total</th>
                        {mode === "products" && <th className="w-10" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cart.map((item, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {item.quantity}
                          </td>
                          <td className="py-2">{item.product.name}</td>
                          <td className="py-2 text-right tabular-nums">
                            ${item.totalPrice.toLocaleString("es-AR")}
                          </td>
                          {mode === "products" && (
                            <td className="px-2 text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleRemoveItem(index)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="border-t p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-bold tabular-nums">
                ${totalAmount.toLocaleString("es-AR")}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleClose}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleConfirm}
                disabled={cart.length === 0}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ProductSelector
        open={isProductSelectorOpen}
        onOpenChange={setIsProductSelectorOpen}
        products={products}
        onConfirm={handleProductsSelected}
      />
    </>
  );
};
