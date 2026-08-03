import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Upload, ShoppingCart, Search } from "lucide-react";
import {
  FaShoppingCart,
  FaFileInvoice,
  FaBox,
  FaReceipt,
} from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GenericModal } from "../components/molecules/GenericModal";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { StatCard } from "../components/molecules/StatCard";
import { ProductsTable } from "../components/molecules/ProductsTable";
import { ProductDrawer } from "../components/molecules/ProductDrawer";
import { Statistics } from "./Statistics";
import { useProducts } from "../components/hooks/useProducts";
import { useStockSummary } from "../components/hooks/useStockSummary";
import { DataItem } from "../types";
import { useGetSales, useCreateSale } from "../components/hooks/useSales";
import { Loader } from "../components/atoms/loader";
import { ModalContentUploadCsv } from "../components/molecules/GenericModal/ModalContentUploadCsv";
import { useGetBudgets } from "../components/hooks/useBudget";
import { useOrders } from "../components/hooks/useOrder";
import { CartItem } from "../models/salesModel";
import { toast } from "react-toastify";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { resolveDashboardBranchMode } from "@/constants/rolePermissions";
import type { Role } from "@/constants/rolePermissions";

type StatType = "sales" | "budgets" | "orders" | "receipts" | null;

export const Dashboard = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<DataItem | null>(null);
  const [isModalSalesOpen, setIsModalSalesOpen] = useState(false);
  const [isModalUploadOpen, setIsModalUploadOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedStat, setSelectedStat] = useState<StatType>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // --- Branch scope resolution ---
  // Reads the current user from localStorage (same pattern as StockScannerPage).
  // branchIds are already returned by GET /auth/me and persisted in localStorage
  // by the login flow.
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const userRole = currentUser?.role as Role | undefined;
  const userBranchIds = currentUser?.branchIds as string[] | undefined;

  const branchMode = useMemo(
    () => resolveDashboardBranchMode(userRole, userBranchIds),
    [userRole, userBranchIds],
  );

  // For admins: the ?branch= URL param enables drill-down into a specific
  // branch's product table. Not set by default (products are org-wide).
  // For vendors/cashiers with a single branch: branchId is auto-resolved.
  const resolvedBranchId =
    branchMode.kind === "single" ? branchMode.branchId : undefined;

  // Admin drill-down: when ?branch=X is set, use it for the product hook only.
  const branchFilter = searchParams.get("branch") || undefined;

  const {
    products,
    loading: productsLoading,
    error: productsError,
  } = useProducts(branchFilter);
  const { sales, loading: salesLoading } = useGetSales(resolvedBranchId);
  const { budgets, loading: loadingBudgets } = useGetBudgets(resolvedBranchId);
  const { orders, loading: loadingOrders } = useOrders(resolvedBranchId);
  const { createSale } = useCreateSale();
  const {
    summary: stockSummary,
    loading: stockSummaryLoading,
    error: stockSummaryError,
  } = useStockSummary();

  useEffect(() => {
    if (stockSummaryError) {
      console.error(
        "Error al cargar el resumen de stock:",
        stockSummaryError.message,
      );
    }
  }, [stockSummaryError]);

  const addProduct = () => { setDrawerProduct(null); setDrawerOpen(true); };
  const addSales = () => setIsModalSalesOpen(true);
  const addUpload = () => setIsModalUploadOpen(true);

  const openEditDrawer = (data: DataItem) => {
    setDrawerProduct(data);
    setDrawerOpen(true);
  };
  const openDuplicateDrawer = (data: DataItem) => {
    setDrawerProduct({
      ...data,
      _id: undefined,
      id: undefined,
      code: "",
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerProduct(null);
  };
  const closeModalSales = () => setIsModalSalesOpen(false);
  const closeModalUpload = () => setIsModalUploadOpen(false);

  const handleConfirmSale = async (
    cart: CartItem[],
    _customerId?: string,
    orderId?: string,
  ) => {
    try {
      await createSale({ cart, orderId: orderId || undefined });
      toast.success("Venta creada con éxito");
    } catch (error) {
      toast.error("Error al crear la venta");
      console.error("Error al crear la venta:", error);
    }
  };

  if (productsLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (productsError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar productos: {productsError.message}
      </div>
    );
  }

  const filterWords = filter.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const filteredProducts = products.filter((product) => {
    if (filterWords.length === 0) return true;
    const variantValues = (product as any).variantAssignments
      ?.map((pv: any) => pv.option?.value ?? "")
      .join(" ");
    const haystack = `${product.name} ${product.code || ""} ${variantValues || ""}`.toLowerCase();
    return filterWords.every(w => haystack.includes(w));
  });

  if (selectedStat) {
    return (
      <Statistics type={selectedStat} onBack={() => setSelectedStat(null)} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado + acciones */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Resumen y stock de tu negocio
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={addProduct}>
            <Plus className="h-4 w-4" />
            Agregar producto
          </Button>
          <Button variant="outline" onClick={addUpload}>
            <Upload className="h-4 w-4" />
            Importar CSV
          </Button>
          <Button variant="outline" onClick={addSales}>
            <ShoppingCart className="h-4 w-4" />
            Nueva venta
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Ventas"
          value={sales.length}
          subtitle="Ver estadísticas"
          icon={<FaShoppingCart />}
          color="success"
          onClick={() => setSelectedStat("sales")}
          loading={salesLoading}
        />
        <StatCard
          title="Presupuestos"
          value={budgets.length}
          subtitle="Ver estadísticas"
          icon={<FaFileInvoice />}
          color="primary"
          onClick={() => setSelectedStat("budgets")}
          loading={loadingBudgets}
        />
        <StatCard
          title="Pedidos"
          value={orders.length}
          subtitle="Ver estadísticas"
          icon={<FaBox />}
          color="warning"
          onClick={() => setSelectedStat("orders")}
          loading={loadingOrders}
        />
        <StatCard
          title="Productos"
          value={products.length}
          subtitle="En inventario"
          icon={<FaReceipt />}
          color="info"
        />
      </div>

      {/* Stock por sucursal */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Stock por sucursal
        </h2>
        {stockSummaryLoading ? (
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="min-w-[180px] flex-1 basis-40 p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-8 w-16" />
              </Card>
            ))}
          </div>
        ) : stockSummary?.branches.length ? (
          <div className="flex flex-wrap gap-4">
            {stockSummary.branches.map((branch) => (
              <Card
                key={branch.branchId}
                onClick={
                  userRole === "ADMIN" || userRole === "MANAGEMENT"
                    ? () => setSearchParams({ branch: branch.branchId })
                    : undefined
                }
                className={cn(
                  "min-w-[180px] flex-1 basis-40 p-5 transition-all",
                  (userRole === "ADMIN" || userRole === "MANAGEMENT") &&
                    "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
                  branch.isHeadquarters &&
                    "border-primary/50 ring-1 ring-primary/20",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      {branch.branchName}
                    </p>
                    <p className="mt-1 text-3xl font-bold tracking-tight">
                      {branch.quantity}
                    </p>
                  </div>
                  {branch.isHeadquarters && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Casa Central
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin sucursales activas para mostrar stock.
          </p>
        )}
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, código o variante..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Tabla de productos / stock */}
      <ProductsTable products={filteredProducts} onEdit={openEditDrawer} onDuplicate={openDuplicateDrawer} />

      {/* Product Drawer (create/edit) */}
      <ProductDrawer open={drawerOpen} onClose={closeDrawer} product={drawerProduct} />

      <SalesDrawer
        isOpen={isModalSalesOpen}
        onClose={closeModalSales}
        products={products}
        orders={orders}
        title="Nueva Venta"
        requireCustomer={false}
        allowOrderSelection={true}
        warning="Una vez confirmada, la venta descuenta el stock y no se puede editar ni deshacer."
        onConfirm={handleConfirmSale}
      />

      <GenericModal isOpen={isModalUploadOpen} onClose={closeModalUpload}>
        <ModalContentUploadCsv />
      </GenericModal>
    </div>
  );
};
