import { useState, ChangeEvent } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  useGetBudgets,
  useCreateBudget,
  useUpdateBudget,
} from "../components/hooks/useBudget";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { ProductsProps } from "../models/productsModel";
import { Budget } from "../models/budgetModel";
import { usePorducts } from "../components/hooks/useProducts";
import { useCustomers } from "../components/hooks/useCustomer";
import { Pagination } from "../components/molecules/pagination";
import { DocumentCard } from "../components/molecules/DocumentCard";
import { Loader } from "../components/atoms/loader";
import { CartItem } from "../models/salesModel";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

export const Quotations = () => {
  const { budgets, error, loading } = useGetBudgets();
  const [isOpen, setIsOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [initialCart, setInitialCart] = useState<CartItem[]>([]);
  const [initialCustomer, setInitialCustomer] = useState("");
  const { submitBudget } = useCreateBudget();
  const { updateBudget } = useUpdateBudget();
  const { customers } = useCustomers();
  const { products, getProducts } = usePorducts();

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [filterDate, setFilterDate] = useState("");
  const [filterCustomerName, setFilterCustomerName] = useState("");

  const openCreate = () => {
    setEditingBudgetId(null);
    setInitialCart([]);
    setInitialCustomer("");
    setIsOpen(true);
  };

  const openEdit = (budget: Budget) => {
    const items = (budget.items || budget.products || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (i: any) => i.product,
    );
    setInitialCart(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items.map((i: any) => ({
        product: i.product as unknown as ProductsProps,
        quantity: i.quantity,
        totalPrice: i.quantity * i.price,
      })),
    );
    setInitialCustomer(budget.customer.id || budget.customer._id || "");
    setEditingBudgetId(budget.id || budget._id || "");
    setIsOpen(true);
  };

  const handleConfirmBudget = (cart: CartItem[], customerId?: string) => {
    if (!customerId) {
      toast.error("Debe seleccionar un cliente");
      return;
    }
    const productsData = cart.map((item) => ({
      product: item.product._id || item.product.id || "",
      quantity: item.quantity,
      price: item.totalPrice / item.quantity,
    }));
    const totalAmount = cart.reduce((total, item) => total + item.totalPrice, 0);

    if (editingBudgetId) {
      const original = budgets.find(
        (b) => (b.id || b._id) === editingBudgetId,
      );
      updateBudget({
        id: editingBudgetId,
        data: {
          customer: customerId,
          products: productsData,
          totalAmount,
          validUntil: original?.validUntil || "2024-12-31",
        },
      });
      toast.success("Presupuesto actualizado con éxito");
      setIsOpen(false);
      return;
    }

    submitBudget({
      customer: customerId,
      products: productsData,
      totalAmount,
      validUntil: "2024-12-31",
    });
    toast.success("Presupuesto creado con éxito");
    getProducts();
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

  const filteredBudgets = budgets.filter((budget) => {
    const budgetDate = new Date(budget.createdAt).toLocaleDateString("en-CA");
    const matchesDate = filterDate ? budgetDate === filterDate : true;
    const matchesCustomer = filterCustomerName
      ? budget.customer.name
          .toLowerCase()
          .includes(filterCustomerName.toLowerCase())
      : true;
    return matchesDate && matchesCustomer;
  });

  const totalPages = Math.ceil(filteredBudgets.length / itemsPerPage);
  const paginatedBudgets = filteredBudgets.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildExport = (budget: any) => ({
    title: "Presupuesto",
    documentNumber: budget.receipt,
    date: formatDate(budget.createdAt),
    customer: budget.customer.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (budget.items || budget.products).map((item: any) => ({
      quantity: item.quantity,
      name: item.product.name,
      price: item.price,
      total: item.quantity * item.price,
    })),
    total: budget.totalAmount,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Presupuestos
          </h1>
          <p className="text-sm text-muted-foreground">
            {filteredBudgets.length} presupuesto
            {filteredBudgets.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Agregar presupuesto
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="q-date">Filtrar por fecha</Label>
          <Input
            id="q-date"
            type="date"
            className="w-auto"
            value={filterDate}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFilterDate(e.target.value)
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-customer">Filtrar por cliente</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="q-customer"
              className="pl-9 sm:w-72"
              placeholder="Buscar por cliente"
              value={filterCustomerName}
              onChange={(e) => setFilterCustomerName(e.target.value)}
            />
          </div>
        </div>
      </div>

      {paginatedBudgets.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          No hay presupuestos para mostrar.
        </Card>
      ) : (
        <div className="space-y-4">
          {paginatedBudgets.map((budget) => {
            const budgetId = budget.id || budget._id || "";
            return (
              <DocumentCard
                key={budgetId}
                label="Presupuesto"
                title={`N° ${budget.receipt}`}
                subtitle={`Cliente: ${budget.customer.name} · Válido hasta ${formatDate(
                  budget.validUntil,
                )}`}
                items={(budget.items || budget.products || []).map(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (item: any) => ({
                    quantity: item.quantity,
                    name: item.product?.name,
                    price: item.price,
                  }),
                )}
                total={budget.totalAmount}
                onEdit={() => openEdit(budget)}
                onExportPDF={() => exportToPDF(buildExport(budget))}
                onExportExcel={() => exportToExcel(buildExport(budget))}
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
        products={products}
        customers={customers}
        title={editingBudgetId ? "Editar Presupuesto" : "Crear Presupuesto"}
        requireCustomer={true}
        editing={!!editingBudgetId}
        initialCart={initialCart}
        initialCustomerId={initialCustomer}
        onConfirm={handleConfirmBudget}
      />
    </div>
  );
};
