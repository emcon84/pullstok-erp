import React, { useState, useEffect } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PaymentSection } from "../PaymentSection";
import { usePayments } from "../../hooks/usePayments";
import { ProductSelector } from "../ProductSelector";
import { DocTable } from "../DocTable";
import { ProductsProps } from "../../../models/productsModel";
import { Customer } from "../../../models/customerModel";
import { CartItem } from "../../../models/salesModel";
import { Order } from "../../../models/orderModel";
import { Budget } from "../../../models/budgetModel";
import { type PaymentInput } from "../../../models/cashSessionModel";
import { round2 } from "@/lib/money";
import { toast } from "react-toastify";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

type Mode = "products" | "order" | "budget";

interface SalesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductsProps[];
  customers?: Customer[];
  orders?: Order[];
  budgets?: Budget[];
  title: string;
  requireCustomer?: boolean;
  allowOrderSelection?: boolean;
  allowBudgetSelection?: boolean;
  warning?: string;
  editing?: boolean;
  initialCart?: CartItem[];
  initialCustomerId?: string;
  /** Id de la caja OPEN del usuario (R8/R9). */
  cashSessionId?: string;
  onConfirm: (
    cart: CartItem[],
    customerId?: string,
    orderId?: string,
    budgetId?: string,
    payments?: PaymentInput[],
    cashSessionId?: string,
    discountPct?: number,
  ) => void;
}

export const SalesDrawer: React.FC<SalesDrawerProps> = ({
  isOpen,
  onClose,
  products,
  customers,
  orders,
  budgets,
  title,
  requireCustomer = false,
  allowOrderSelection = false,
  allowBudgetSelection = false,
  warning,
  editing = false,
  initialCart,
  initialCustomerId,
  onConfirm,
  cashSessionId,
}) => {
  const [mode, setMode] = useState<Mode>("products");
  const [showConfirm, setShowConfirm] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [selectedBudget, setSelectedBudget] = useState("");
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

  // ── Descuento porcentual a nivel venta (sdd/venta-descuento) ──
  // El admin/vendedor ingresa un % (0..100); el descuento en $ se materializa
  // con round2 y totalAmount (subtotal − descuento) alimenta el vuelto, el
  // saldo restante (addPayment) y el payload de payments (R7).
  const [discountPct, setDiscountPct] = useState(0);
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountAmount = round2((subtotal * discountPct) / 100);
  const totalAmount = round2(subtotal - discountAmount);
  const pay = usePayments(totalAmount);

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    setDiscountPct(Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0);
  };

  const tabs: { key: Mode; label: string }[] = [
    { key: "products", label: "Productos" },
    ...(allowOrderSelection
      ? [{ key: "order" as Mode, label: "Desde pedido" }]
      : []),
    ...(allowBudgetSelection
      ? [{ key: "budget" as Mode, label: "Desde presupuesto" }]
      : []),
  ];

  // Cargar items desde el pedido o presupuesto seleccionado
  useEffect(() => {
    if (mode === "order" && selectedOrder && orders) {
      const order = orders.find((o) => (o._id || o.id) === selectedOrder);
      if (order?.items) {
        setCart(
          order.items
            .filter((item) => item.product !== null)
            .map((item) => ({
              product: item.product as ProductsProps,
              quantity: item.quantity,
              totalPrice:
                (item.price || item.product?.price || 0) * item.quantity,
            })),
        );
      }
    } else if (mode === "budget" && selectedBudget && budgets) {
      const budget = budgets.find((b) => (b._id || b.id) === selectedBudget);
      const items = budget?.items || budget?.products || [];
      setCart(
        items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((item: any) => item.product !== null)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => ({
            product: item.product as ProductsProps,
            quantity: item.quantity,
            totalPrice: (item.price || 0) * item.quantity,
          })),
      );
    }
  }, [selectedOrder, selectedBudget, mode, orders, budgets]);

  // Pre-carga para edición: al abrir, llena el carrito con los items del documento.
  useEffect(() => {
    if (isOpen && editing) {
      setMode("products");
      setCart(initialCart ?? []);
      setSelectedCustomer(initialCustomerId ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editing]);

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
    setSelectedBudget("");
    setMode("products");
    pay.reset();
  };

  const validate = () => {
    if (cart.length === 0) {
      toast.error("Debes agregar al menos un producto");
      return false;
    }
    if (mode === "products" && requireCustomer && !selectedCustomer) {
      toast.error("Debes seleccionar un cliente");
      return false;
    }
    if (mode === "order" && !selectedOrder) {
      toast.error("Debes seleccionar un pedido");
      return false;
    }
    if (mode === "budget" && !selectedBudget) {
      toast.error("Debes seleccionar un presupuesto");
      return false;
    }
    return true;
  };

  const doConfirm = () => {
    // Payload final: los payments declarados deben sumar el total (R7). Si no
    // se declaró nada, se declara EFECTIVO por el total. El vuelto (recibido -
    // total) NO se persiste — R10. cashSessionId se propaga tal cual (undefined
    // para ventas legacy/admin sin caja abierta → backward-compat).
    onConfirm(
      cart,
      selectedCustomer,
      selectedOrder,
      selectedBudget,
      pay.finalize(),
      cashSessionId,
      discountPct,
    );
    resetState();
    setShowConfirm(false);
    onClose();
  };

  const handleConfirmClick = () => {
    if (!validate()) return;
    if (warning) setShowConfirm(true);
    else doConfirm();
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const isFromSource = mode === "order" || mode === "budget";

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
            {warning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{warning}</span>
              </div>
            )}
            {!editing && tabs.length > 1 && (
              <div
                className="grid gap-1 rounded-lg bg-muted p-1"
                style={{
                  gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))`,
                }}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={cn(
                      "rounded-md py-2 text-sm font-medium transition-colors",
                      mode === tab.key
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => {
                      if (tab.key === "products" && mode !== "products") {
                        setCart([]);
                      }
                      setMode(tab.key);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {mode === "order" && orders && (
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

            {mode === "budget" && budgets && (
              <div className="space-y-2">
                <Label htmlFor="budget-select">Seleccionar presupuesto</Label>
                <select
                  id="budget-select"
                  className={selectClass}
                  value={selectedBudget}
                  onChange={(e) => setSelectedBudget(e.target.value)}
                >
                  <option value="" disabled>
                    Seleccione un presupuesto
                  </option>
                  {budgets.map((budget) => {
                    const id = budget._id || budget.id || "";
                    return (
                      <option key={id} value={id}>
                        {budget.receipt} - {budget.customer?.name}
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
                      : "Seleccioná una opción arriba para ver sus productos"}
                  </p>
                </div>
              ) : (
                <DocTable
                  items={cart.map((item) => ({
                    quantity: item.quantity,
                    name: item.product.name,
                    // Conserva el precio de la línea (historial de pedido/budget):
                    // Total = quantity * effective unit = totalPrice exacto.
                    price:
                      item.quantity && item.totalPrice
                        ? item.totalPrice / item.quantity
                        : Number(item.product.price) || 0,
                  }))}
                  onRemove={isFromSource ? undefined : handleRemoveItem}
                />
              )}
            </div>
          </div>

          <div className="border-t p-5">
            <PaymentSection
              idPrefix="sd-pay"
              payments={pay.payments}
              selectedMethod={pay.selectedMethod}
              setSelectedMethod={pay.setSelectedMethod}
              cashReceived={pay.cashReceived}
              setCashReceived={pay.setCashReceived}
              addPayment={pay.addPayment}
              clearPayments={pay.clearPayments}
              total={totalAmount}
              className="mb-4"
            />

            {pay.vuelto > 0 && (
              <div className="mb-4 flex items-center justify-between rounded-lg bg-emerald-50 p-2 text-sm">
                <span>Vuelto</span>
                <span className="font-bold tabular-nums">
                  ${pay.vuelto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="mb-4 flex items-center justify-between gap-3">
              <Label htmlFor="sd-discount" className="shrink-0">
                Descuento (%)
              </Label>
              <Input
                id="sd-discount"
                type="number"
                min={0}
                max={100}
                step="1"
                value={discountPct}
                onChange={handleDiscountChange}
                className="w-28"
              />
            </div>
            <div className="mb-4 space-y-1 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  ${subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Descuento</span>
                <span className="tabular-nums">
                  −${discountAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-xl font-bold tabular-nums">
                  ${totalAmount.toLocaleString("es-AR")}
                </span>
              </div>
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
                onClick={handleConfirmClick}
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

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar?</AlertDialogTitle>
            <AlertDialogDescription>{warning}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doConfirm}>
              Sí, confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};


