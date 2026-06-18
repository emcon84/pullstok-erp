import { useState, ChangeEvent } from "react";
import DateObject from "react-date-object";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Pagination } from "../components/molecules/pagination";
import { DocumentCard } from "../components/molecules/DocumentCard";
import { useGetSales, useCreateSale } from "../components/hooks/useSales";
import { Loader } from "../components/atoms/loader";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { useOrders } from "../components/hooks/useOrder";
import { usePorducts } from "../components/hooks/useProducts";
import { toast } from "react-toastify";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";
import { CartItem } from "../models/salesModel";

export const SalesPage = () => {
  const { sales, loading, error } = useGetSales();
  const { orders } = useOrders();
  const { products } = usePorducts();
  const { createSale } = useCreateSale();
  const [isOpen, setIsOpen] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterProductName, setFilterProductName] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const filteredSales = sales.filter((sale) => {
    const matchesDate = filterDate
      ? new DateObject(sale.saleDate).format("YYYY-MM-DD") === filterDate
      : true;
    const prods = sale.items || sale.products || [];
    const matchesProduct = filterProductName
      ? prods.some((product) =>
          product.name.toLowerCase().includes(filterProductName),
        )
      : true;
    return matchesDate && matchesProduct;
  });

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleDateFilterChange = (e: ChangeEvent<HTMLInputElement>) =>
    setFilterDate(e.target.value);
  const handleProductNameFilterChange = (e: ChangeEvent<HTMLInputElement>) =>
    setFilterProductName(e.target.value.toLowerCase());

  const handleConfirmSale = async (
    cart: CartItem[],
    _customerId?: string,
    _orderId?: string,
  ) => {
    try {
      await createSale(cart);
      toast.success("Venta creada con éxito");
      setIsOpen(false);
    } catch (error) {
      toast.error("Error al crear la venta");
      console.error("Error al crear la venta:", error);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildExport = (sale: any) => ({
    title: "Venta",
    documentNumber: sale.receipt || sale.id || "",
    date: new Date(sale.createdAt || sale.saleDate).toLocaleDateString("es-AR"),
    customer: sale.customer?.name || "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (sale.items || []).map((item: any) => ({
      quantity: item.quantity,
      name: item.name || "",
      price: item.price,
      total: item.quantity * item.price,
    })),
    total: sale.totalAmount || 0,
  });

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
        Error al cargar ventas: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            {filteredSales.length} venta
            {filteredSales.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => setIsOpen(true)}>
          <Plus className="h-4 w-4" />
          Agregar venta
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="filter-date">Filtrar por fecha</Label>
          <Input
            id="filter-date"
            type="date"
            className="w-auto"
            value={filterDate}
            onChange={handleDateFilterChange}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-product">Filtrar por producto</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="filter-product"
              className="pl-9 sm:w-72"
              placeholder="Buscar por producto"
              value={filterProductName}
              onChange={handleProductNameFilterChange}
            />
          </div>
        </div>
      </div>

      {/* Lista */}
      {paginatedSales.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          No hay ventas para mostrar.
        </Card>
      ) : (
        <div className="space-y-4">
          {paginatedSales.map((sale) => {
            const saleId = sale.id || sale._id || "";
            return (
              <DocumentCard
                key={saleId}
                label="Venta"
                title={`Fecha: ${new DateObject(sale.saleDate).format(
                  "DD-MM-YYYY",
                )}`}
                items={(sale.items || sale.products || []) as never[]}
                total={sale.totalAmount}
                onExportPDF={() => exportToPDF(buildExport(sale))}
                onExportExcel={() => exportToExcel(buildExport(sale))}
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
        orders={orders || []}
        title="Crear Venta"
        allowOrderSelection={true}
        onConfirm={handleConfirmSale}
      />
    </div>
  );
};
