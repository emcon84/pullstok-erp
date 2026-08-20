import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Upload, ShoppingCart, Search, X, Printer } from "lucide-react";
import {
  FaShoppingCart,
  FaFileInvoice,
  FaBox,
  FaReceipt,
} from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GenericModal } from "../components/molecules/GenericModal";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { StatCard } from "../components/molecules/StatCard";
import { ProductsTable } from "../components/molecules/ProductsTable";
import { PrintProductList } from "../components/molecules/PrintProductList";
import { ProductDrawer } from "../components/molecules/ProductDrawer";
import { QuickPriceModal } from "../components/molecules/QuickPriceModal";
import { Statistics } from "./Statistics";
import { useProducts, useProductFacets } from "../components/hooks/useProducts";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { resolveDashboardBranchMode } from "@/constants/rolePermissions";
import type { Role } from "@/constants/rolePermissions";
import { VendorDashboard } from "./VendorDashboard";
import { FilterChips } from "../components/molecules/FilterChips";
import { planTitleKeyOf } from "@/lib/printGrouping";
import {
  parseFilterTerms,
  matchesProductFilter,
} from "@/lib/productFilter";

type StatType = "sales" | "budgets" | "orders" | "receipts" | null;

export const Dashboard = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<DataItem | null>(null);
  const [quickPriceProduct, setQuickPriceProduct] = useState<DataItem | null>(null);
  const [isModalSalesOpen, setIsModalSalesOpen] = useState(false);
  const [isModalUploadOpen, setIsModalUploadOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  // Título de planilla SECO (sdd/alican-plan-titles): filtro client-side por
  // la clave compuesta [brand, line, subline].filter(Boolean).join("|").
  const [titleFilter, setTitleFilter] = useState<string | null>(null);
  // Tipo de planilla ALICAN (SECO/WET): null = Todos (comportamiento actual).
  // Filtra el listado server-side y define qué títulos muestran las facets.
  const [planType, setPlanType] = useState<"SECO" | "WET" | null>(null);
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

  // ── Vendor/Cashier quick-sale dashboard ──
  if (branchMode.kind === "single") {
    return <VendorDashboard branchId={branchMode.branchId} />;
  }

  const {
    products,
    loading: productsLoading,
    error: productsError,
  } = useProducts(branchFilter, undefined, undefined, planType ?? undefined);
  // Títulos de planilla (facets del backend): chips para el filtro client-side.
  // En modo WET la planilla es plana y el backend devuelve titles vacíos.
  const { titles: facetTitles } = useProductFacets(
    undefined,
    planType ?? undefined,
  );
  const { sales, loading: salesLoading } = useGetSales(resolvedBranchId);
  const { budgets, loading: loadingBudgets } = useGetBudgets(resolvedBranchId);
  const { orders, loading: loadingOrders } = useOrders(resolvedBranchId);
  const { createSale } = useCreateSale();
  const {
    summary: stockSummary,
    loading: stockSummaryLoading,
    error: stockSummaryError,
  } = useStockSummary();

  // Resolve branch name for the active drill-down filter.
  const selectedBranchName = useMemo(() => {
    if (!branchFilter || !stockSummary?.branches) return null;
    const b = stockSummary.branches.find((br) => br.branchId === branchFilter);
    return b?.branchName ?? null;
  }, [branchFilter, stockSummary?.branches]);

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

  // Cambio de tipo de planilla ALICAN (Todos/SECO/WET). Los títulos de
  // planilla son por tipo: al cambiar se limpia el filtro de título activo
  // (una key SECO no aplica en WET y viceversa) y se refetch con el nuevo tipo.
  const handlePlanTypeChange = (t: "SECO" | "WET" | null) => {
    setPlanType(t);
    if (t !== planType) setTitleFilter(null);
  };

  // El selector de tipo y los chips de títulos de planilla son filtros
  // específicos de ALICAN: solo se muestran cuando ese proveedor está
  // seleccionado. Al salir de ALICAN se limpian (las claves de título y el
  // tipo no aplican a otros proveedores).
  const isAlican = providerFilter.toLowerCase() === "alican";
  const handleProviderChange = (name: string) => {
    setProviderFilter(name);
    if (name.toLowerCase() !== "alican") {
      setTitleFilter(null);
      setPlanType(null);
    }
  };

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
  const openQuickPrice = (data: DataItem) => setQuickPriceProduct(data);
  const closeQuickPrice = () => setQuickPriceProduct(null);
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

  // ── Products already filtered by branch filter ──

  // "Purina, Proplan" → OR entre marcas; espacios dentro de un término → AND.
  const filterTerms = useMemo(() => parseFilterTerms(filter), [filter]);
  const filteredProducts = useMemo(() => {
    let list = products;
    if (categoryFilter) {
      list = list.filter((p) => {
        const cat = (p as any).category?.name || p.category || "";
        return String(cat).toLowerCase().includes(categoryFilter.toLowerCase());
      });
    }
    if (providerFilter) {
      list = list.filter((p) => {
        const name = (p as any).provider?.name || "";
        return String(name).toLowerCase() === providerFilter.toLowerCase();
      });
    }
    if (titleFilter) {
      list = list.filter((p) => planTitleKeyOf(p) === titleFilter);
    }
    if (filterTerms.length === 0) return list;
    return list.filter((product) => matchesProductFilter(product, filterTerms));
  }, [products, filterTerms, categoryFilter, providerFilter, titleFilter]);

  // Proveedores disponibles en el catálogo cargado (para el select de filtro).
  const availableProviders = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const p of products) {
      const name = (p as any).provider?.name;
      if (name && typeof name === "string" && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        names.push(name);
      }
    }
    return names.sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

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
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir listado
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
                  branchFilter === branch.branchId &&
                    "ring-2 ring-primary border-primary/60 bg-primary/5",
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

      {/* Indicador de sucursal seleccionada */}
      {selectedBranchName && (
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="gap-1.5 px-3 py-1.5 text-sm font-medium"
          >
            Viendo: {selectedBranchName}
            <button
              onClick={() => setSearchParams({})}
              className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
              aria-label="Quitar filtro de sucursal"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Badge>
        </div>
      )}

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

      {/* Filtro por proveedor */}
      {availableProviders.length > 0 && (
        <div className="max-w-xs">
          <Select
            value={providerFilter || "all"}
            onValueChange={(v) => handleProviderChange(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos los proveedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              {availableProviders.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Filtro por tipo de planilla ALICAN (SECO/WET): null = Todos. Solo se
          muestra cuando el proveedor seleccionado es ALICAN. */}
      {isAlican && (
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
            Tipo
          </span>
          <div className="flex flex-wrap gap-1.5">
            {([null, "SECO", "WET"] as const).map((t) => (
              <Badge
                key={t ?? "all"}
                variant={planType === t ? "default" : "outline"}
                className="shrink-0 cursor-pointer px-2.5 py-1 text-xs font-medium whitespace-nowrap uppercase"
                onClick={() => handlePlanTypeChange(t)}
              >
                {t ?? "Todos"}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter chips ── */}
      <FilterChips
        products={products}
        filter={filter}
        categoryFilter={categoryFilter}
        titles={isAlican ? facetTitles : undefined}
        titleFilter={isAlican ? titleFilter : null}
        onTitleChange={setTitleFilter}
        onFilterChange={setFilter}
        onCategoryChange={setCategoryFilter}
        onClear={() => { setFilter(""); setCategoryFilter(""); setProviderFilter(""); setTitleFilter(null); }}
      />

      {/* Tabla de productos / stock */}
      <ProductsTable products={filteredProducts} onEdit={openEditDrawer} onDuplicate={openDuplicateDrawer} onQuickPrice={openQuickPrice} branchMode={!!branchFilter} />

      {/* Print area: only visible when printing (see @media print in index.css) */}
      <PrintProductList products={filteredProducts} />

      {/* Product Drawer (create/edit) */}
      <ProductDrawer open={drawerOpen} onClose={closeDrawer} product={drawerProduct} />

      {/* Quick price modal (solo precio, atajo Ctrl+Shift+P / Enter) */}
      <QuickPriceModal open={!!quickPriceProduct} onClose={closeQuickPrice} product={quickPriceProduct} />

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
