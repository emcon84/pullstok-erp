import React, { useState, useMemo, useRef, useEffect, ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useCreateOrder,
  useOrders,
  useUpdateOrder,
  useDeleteOrder,
} from "../components/hooks/useOrder";
import { ProductsProps } from "../models/productsModel";
import { useGetBudgetByID, useGetBudgets } from "../components/hooks/useBudget";
import { Order } from "../models/orderModel";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { useCustomers } from "../components/hooks/useCustomer";
import { usePorducts } from "../components/hooks/useProducts";
import { useCreateSale } from "../components/hooks/useSales";
import {
  useWhatsappDrafts,
  useApproveDraft,
} from "../components/hooks/useWhatsappOrders";
import { WhatsAppOrderDraft } from "../models/whatsappOrderModel";
import { CartItem } from "../models/salesModel";
import type { PaymentInput } from "../models/cashSessionModel";
import { Pagination } from "../components/molecules/pagination";
import { DocumentCard } from "../components/molecules/DocumentCard";
import { Loader } from "../components/atoms/loader";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

const statusBadge = (status?: string) => {
  const map: Record<string, string> = {
    PENDING: "border-amber-300 bg-amber-50 text-amber-700",
    COMPLETED: "border-emerald-300 bg-emerald-50 text-emerald-700",
    CANCELLED: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  const labels: Record<string, string> = {
    PENDING: "Pendiente",
    COMPLETED: "Completado",
    CANCELLED: "Cancelado",
  };
  if (!status) return null;
  return (
    <Badge variant="outline" className={cn("font-medium", map[status])}>
      {labels[status] ?? status}
    </Badge>
  );
};

const sourceBadge = (source?: string) => {
  if (source !== "STORE") return null;
  return (
    <Badge
      variant="outline"
      className="border-primary/30 bg-primary/10 font-medium text-primary"
    >
      🛒 Tienda
    </Badge>
  );
};

export const Orders: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [initialCart, setInitialCart] = useState<CartItem[]>([]);
  const [initialCustomer, setInitialCustomer] = useState("");
  const { orders, loading, error } = useOrders();
  const { budgets } = useGetBudgets();
  const { customers } = useCustomers();
  const { products } = usePorducts();
  const { submitOrder: createOrder } = useCreateOrder();
  const { updateOrder } = useUpdateOrder();
  const { deleteOrder } = useDeleteOrder();
  const { createSale } = useCreateSale();

  // ── Pre-carga desde un borrador de WhatsApp (FASE 3) ──
  // Si llegamos con ?whatsappDraft=<id>, al cargar el borrador se abre el drawer
  // de "nuevo pedido" con el cliente del borrador preseleccionado y un aviso
  // con el producto que pidió. Al confirmar, en vez de createOrder se llama
  // approveDraft (el backend crea el Order real y marca el borrador APPROVED).
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsAppOrderDraft | null>(
    null,
  );
  const [searchParams] = useSearchParams();
  const { drafts: whatsappDrafts } = useWhatsappDrafts();
  const { approve: approveDraft } = useApproveDraft();
  const draftAppliedRef = useRef(false);

  useEffect(() => {
    const draftId = searchParams.get("whatsappDraft");
    // Sin query param, o ya aplicado, o el drawer quedó abierto por otra acción.
    if (!draftId || draftAppliedRef.current || isOpen) return;
    const draft = whatsappDrafts.find((d) => d.id === draftId);
    if (!draft) return;
    draftAppliedRef.current = true;
    setWhatsappDraft(draft);
    setEditingOrderId(null);
    setInitialCart([]);
    setInitialCustomer(draft.customerId || "");
    setIsOpen(true);
  }, [searchParams, whatsappDrafts, isOpen]);

  // Estado del drawer para crear una VENTA desde un pedido
  const [saleDrawerOpen, setSaleDrawerOpen] = useState(false);
  const [saleInitialCart, setSaleInitialCart] = useState<CartItem[]>([]);
  const [saleOrderId, setSaleOrderId] = useState("");

  const openCreateSale = (order: Order) => {
    const items = (order.items || order.products || []).filter((i) => i.product);
    setSaleInitialCart(
      items.map((i) => ({
        product: i.product as unknown as ProductsProps,
        quantity: i.quantity,
        totalPrice: i.quantity * i.price,
      })),
    );
    setSaleOrderId(order.id || order._id || "");
    setSaleDrawerOpen(true);
  };

  const handleConfirmSaleFromOrder = (
    cart: CartItem[],
    _customerId?: string,
    orderId?: string,
    _budgetId?: string,
    payments?: PaymentInput[],
    cashSessionId?: string,
    discountPct?: number,
  ) => {
    createSale(
      {
        cart,
        orderId: saleOrderId || orderId || undefined,
        payments,
        cashSessionId,
        discountPct,
      },
      {
        onSuccess: () => toast.success("Venta creada desde el pedido"),
        onError: () => toast.error("No se pudo crear la venta"),
      },
    );
    setSaleDrawerOpen(false);
    setSaleInitialCart([]);
    setSaleOrderId("");
  };

  const handleDeleteOrder = (id: string) => {
    deleteOrder(id, {
      onSuccess: () => toast.success("Pedido eliminado"),
      onError: () => toast.error("No se pudo eliminar el pedido"),
    });
  };

  const openCreate = () => {
    // Acción manual: limpia cualquier pre-carga de borrador de WhatsApp.
    setWhatsappDraft(null);
    setEditingOrderId(null);
    setInitialCart([]);
    setInitialCustomer("");
    setIsOpen(true);
  };

  const openEdit = (order: Order) => {
    const items = (order.items || order.products || []).filter(
      (i) => i.product,
    );
    setInitialCart(
      items.map((i) => ({
        product: i.product as unknown as ProductsProps,
        quantity: i.quantity,
        totalPrice: i.quantity * i.price,
      })),
    );
    setInitialCustomer(order.customer?.id || order.customer?._id || "");
    setEditingOrderId(order.id || order._id || "");
    setWhatsappDraft(null);
    setIsOpen(true);
  };

  const [filterDate, setFilterDate] = useState("");
  const [filterCustomerName, setFilterCustomerName] = useState("");
  const [filterReceipt, setFilterReceipt] = useState("");
  const [filterSource, setFilterSource] = useState<"ALL" | "STORE" | "INTERNAL">(
    "ALL",
  );
  const [filterStatus, setFilterStatus] = useState<
    "ALL" | "PENDING" | "COMPLETED" | "CANCELLED"
  >("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderDate = new Date(order.createdAt).toLocaleDateString("en-CA");
      const matchesDate = filterDate ? orderDate === filterDate : true;
      const matchesCustomer = filterCustomerName
        ? order.customer &&
          order.customer.name.toLowerCase().includes(filterCustomerName)
        : true;
      const matchesReceipt = filterReceipt
        ? order.receipt?.toLowerCase().includes(filterReceipt.toLowerCase())
        : true;
      // source undefined se trata como "Interno" (no-Tienda)
      const matchesSource =
        filterSource === "ALL"
          ? true
          : filterSource === "STORE"
            ? order.source === "STORE"
            : order.source !== "STORE";
      const matchesStatus =
        filterStatus === "ALL" ? true : order.status === filterStatus;
      return (
        matchesDate &&
        matchesCustomer &&
        matchesReceipt &&
        matchesSource &&
        matchesStatus
      );
    });
  }, [orders, filterDate, filterCustomerName, filterReceipt, filterSource, filterStatus]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleDrawerConfirm = (
    cart: CartItem[],
    customerId?: string,
    _orderId?: string,
    budgetId?: string,
  ) => {
    if (whatsappDraft) {
      // Pedido desde un borrador de WhatsApp: el vendedor armó los productos
      // reales en el drawer; el backend crea el Order (source WHATSAPP) y marca
      // el borrador APPROVED. No duplicamos la creación acá.
      if (cart.length === 0) {
        toast.error("Debes agregar al menos un producto");
        return;
      }
      const productsPayload = cart.map((item) => ({
        productId: item.product._id || item.product.id || "",
        quantity: item.quantity,
        price: item.totalPrice / item.quantity,
      }));
      const totalAmount = cart.reduce((sum, item) => sum + item.totalPrice, 0);
      approveDraft(
        { id: whatsappDraft.id, data: { products: productsPayload, totalAmount } },
        {
          onSuccess: () => toast.success("Pedido aprobado y creado desde WhatsApp"),
          onError: () => toast.error("No se pudo aprobar el pedido"),
        },
      );
      setWhatsappDraft(null);
      setIsOpen(false);
      return;
    }
    if (editingOrderId) {
      // EDITAR pedido existente
      const productsPayload = cart.map((item) => ({
        productId: item.product._id || item.product.id || "",
        quantity: item.quantity,
        price: item.totalPrice / item.quantity,
      }));
      const totalAmount = cart.reduce((sum, item) => sum + item.totalPrice, 0);
      updateOrder({
        id: editingOrderId,
        data: {
          products: productsPayload,
          totalAmount,
          customer: customerId || initialCustomer,
        },
      });
      toast.success("Pedido actualizado correctamente");
      setIsOpen(false);
      return;
    }
    if (budgetId) {
      // Pedido desde un presupuesto existente
      const budget = budgets?.find((b) => (b.id || b._id) === budgetId);
      const customer = budget?.customer.id || budget?.customer._id || "";
      createOrder({ customer, quotationId: budgetId, type: "sale" });
    } else {
      // Pedido directo con productos
      if (!customerId) {
        toast.error("Debes seleccionar un cliente");
        return;
      }
      const productsPayload = cart.map((item) => ({
        productId: item.product._id || item.product.id || "",
        quantity: item.quantity,
        price: item.totalPrice / item.quantity,
      }));
      const totalAmount = cart.reduce((sum, item) => sum + item.totalPrice, 0);
      createOrder({
        customer: customerId,
        products: productsPayload,
        totalAmount,
        type: "sale",
      });
    }
    toast.success("Pedido creado correctamente");
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            {filteredOrders.length} pedido
            {filteredOrders.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Agregar pedido
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="o-date">Filtrar por fecha</Label>
          <Input
            id="o-date"
            type="date"
            className="w-auto"
            value={filterDate}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFilterDate(e.target.value)
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="o-customer">Filtrar por cliente</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="o-customer"
              className="pl-9 sm:w-56"
              placeholder="Buscar por cliente"
              value={filterCustomerName}
              onChange={(e) =>
                setFilterCustomerName(e.target.value.toLowerCase())
              }
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="o-receipt">Filtrar por N° presupuesto</Label>
          <Input
            id="o-receipt"
            className="sm:w-48"
            placeholder="N° presupuesto"
            value={filterReceipt}
            onChange={(e) => setFilterReceipt(e.target.value.toLowerCase())}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="o-source">Origen</Label>
          <Select
            value={filterSource}
            onValueChange={(v) =>
              setFilterSource(v as "ALL" | "STORE" | "INTERNAL")
            }
          >
            <SelectTrigger id="o-source" className="w-full sm:w-40">
              <SelectValue placeholder="Origen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="STORE">Tienda</SelectItem>
              <SelectItem value="INTERNAL">Interno</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="o-status">Estado</Label>
          <Select
            value={filterStatus}
            onValueChange={(v) =>
              setFilterStatus(
                v as "ALL" | "PENDING" | "COMPLETED" | "CANCELLED",
              )
            }
          >
            <SelectTrigger id="o-status" className="w-full sm:w-40">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="PENDING">Pendiente</SelectItem>
              <SelectItem value="COMPLETED">Completado</SelectItem>
              <SelectItem value="CANCELLED">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {paginatedOrders.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          {filterDate ||
          filterCustomerName ||
          filterReceipt ||
          filterSource !== "ALL" ||
          filterStatus !== "ALL"
            ? "No hay pedidos con estos filtros."
            : "No hay pedidos para mostrar."}
        </Card>
      ) : (
        <div className="space-y-4">
          {paginatedOrders.map((order) => {
            const orderId = order.id || order._id || "";
            return (
              <OrderDetail
                key={orderId}
                order={order}
                onEdit={openEdit}
                onDelete={handleDeleteOrder}
                onCreateSale={openCreateSale}
              />
            );
          })}
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />

      <SalesDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        products={products || []}
        customers={customers}
        budgets={budgets}
        title={
          whatsappDraft
            ? "Crear Pedido (WhatsApp)"
            : editingOrderId
              ? "Editar Pedido"
              : "Crear Pedido"
        }
        // En un borrador de WhatsApp sin customer linkeado, el backend resuelve
        // "Consumidor final"; por eso no se exige cliente en ese modo.
        requireCustomer={!whatsappDraft}
        allowBudgetSelection={!editingOrderId && !whatsappDraft}
        // editing=true para que el drawer pre-cargue el cliente del borrador y
        // oculte las tabs (solo productos). El branch en handleDrawerConfirm
        // distingue edición vs aprobación de WhatsApp antes de llegar al edit.
        editing={!!editingOrderId || !!whatsappDraft}
        initialCart={initialCart}
        initialCustomerId={initialCustomer}
        warning={
          whatsappDraft
            ? `Pedido desde WhatsApp: ${
                whatsappDraft.productText || "producto por confirmar"
              }. Elegí los productos reales y el total.`
            : undefined
        }
        onConfirm={handleDrawerConfirm}
      />

      {/* Drawer para crear una VENTA a partir de un pedido (carrito precargado) */}
      <SalesDrawer
        isOpen={saleDrawerOpen}
        onClose={() => setSaleDrawerOpen(false)}
        products={products || []}
        title="Crear Venta desde Pedido"
        editing
        initialCart={saleInitialCart}
        warning="Una vez confirmada, la venta descuenta el stock y no se puede editar ni deshacer."
        onConfirm={handleConfirmSaleFromOrder}
      />
    </div>
  );
};

interface OrderDetailProps {
  order: Order;
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
  onCreateSale: (order: Order) => void;
}

const OrderDetail: React.FC<OrderDetailProps> = ({
  order,
  onEdit,
  onDelete,
  onCreateSale,
}) => {
  const { data: budget, isLoading } = useGetBudgetByID(order.quotation || "");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildExport = (o: any) => ({
    title: "Pedido",
    documentNumber: o.receipt || o.id || "",
    date: formatDate(o.createdAt),
    customer: o.customer?.name || "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (o.items || o.products || []).map((item: any) => ({
      quantity: item.quantity,
      name: item.product?.name || item.name || "",
      price: item.price,
      total: item.quantity * item.price,
    })),
    total: o.totalAmount || 0,
  });

  if (isLoading) {
    return (
      <Card className="flex h-24 items-center justify-center">
        <Loader />
      </Card>
    );
  }

  return (
    <DocumentCard
      label="Pedido"
      title={`N° ${order.receipt}`}
      subtitle={`Cliente: ${order.customer?.name || budget?.customer?.name || "—"} · Creado ${formatDate(
        order.createdAt,
      )}`}
      badge={
        <>
          {statusBadge(order.status)}
          {sourceBadge(order.source)}
        </>
      }
      onCreateSale={
        order.status === "PENDING" ? () => onCreateSale(order) : undefined
      }
      items={(order.items || order.products || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any) => ({
          quantity: item.quantity,
          name: item.product?.name || item.name,
          price: item.price,
        }),
      )}
      total={order.totalAmount}
      onEdit={() => onEdit(order)}
      onDelete={() => onDelete(order.id || order._id || "")}
      onExportPDF={() => exportToPDF(buildExport(order))}
      onExportExcel={() => exportToExcel(buildExport(order))}
    />
  );
};
