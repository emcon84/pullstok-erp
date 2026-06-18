import React, { useState, ChangeEvent } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCreateOrder, useOrders } from "../components/hooks/useOrder";
import { useGetBudgetByID, useGetBudgets } from "../components/hooks/useBudget";
import { Order } from "../models/orderModel";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { useCustomers } from "../components/hooks/useCustomer";
import { usePorducts } from "../components/hooks/useProducts";
import { CartItem } from "../models/salesModel";
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

export const Orders: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { orders, loading, error } = useOrders();
  const { budgets } = useGetBudgets();
  const { customers } = useCustomers();
  const { products } = usePorducts();
  const { submitOrder: createOrder } = useCreateOrder();

  const [filterDate, setFilterDate] = useState("");
  const [filterCustomerName, setFilterCustomerName] = useState("");
  const [filterReceipt, setFilterReceipt] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const filteredOrders = orders.filter((order) => {
    const orderDate = new Date(order.createdAt).toLocaleDateString("en-CA");
    const matchesDate = filterDate ? orderDate === filterDate : true;
    const matchesCustomer = filterCustomerName
      ? order.customer &&
        order.customer.name.toLowerCase().includes(filterCustomerName)
      : true;
    const matchesReceipt = filterReceipt
      ? order.receipt?.toLowerCase().includes(filterReceipt.toLowerCase())
      : true;
    return matchesDate && matchesCustomer && matchesReceipt;
  });

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
        <Button onClick={() => setIsOpen(true)}>
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
      </div>

      {paginatedOrders.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          No hay pedidos para mostrar.
        </Card>
      ) : (
        <div className="space-y-4">
          {paginatedOrders.map((order) => {
            const orderId = order.id || order._id || "";
            return <OrderDetail key={orderId} order={order} />;
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
        title="Crear Pedido"
        requireCustomer
        allowBudgetSelection
        onConfirm={handleDrawerConfirm}
      />
    </div>
  );
};

interface OrderDetailProps {
  order: Order;
}

const OrderDetail: React.FC<OrderDetailProps> = ({ order }) => {
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
      subtitle={`Cliente: ${budget?.customer.name || "Desconocido"} · Creado ${formatDate(
        order.createdAt,
      )}`}
      badge={statusBadge(order.status)}
      items={(order.items || order.products || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any) => ({
          quantity: item.quantity,
          name: item.product?.name || item.name,
          price: item.price,
        }),
      )}
      total={order.totalAmount}
      onExportPDF={() => exportToPDF(buildExport(order))}
      onExportExcel={() => exportToExcel(buildExport(order))}
    />
  );
};
