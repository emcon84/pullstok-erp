import { useState } from "react";
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
import { Statistics } from "./Statistics";
import { useProducts } from "../components/hooks/useProducts";
import { ModalContent } from "../components/molecules/GenericModal/ModalContent";
import { DataItem } from "../types";
import { useGetSales, useCreateSale } from "../components/hooks/useSales";
import { Loader } from "../components/atoms/loader";
import { ModalContentUploadCsv } from "../components/molecules/GenericModal/ModalContentUploadCsv";
import { useGetBudgets } from "../components/hooks/useBudget";
import { useOrders } from "../components/hooks/useOrder";
import { CartItem } from "../models/salesModel";
import { toast } from "react-toastify";

type StatType = "sales" | "budgets" | "orders" | "receipts" | null;

export const Dashboard = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalSalesOpen, setIsModalSalesOpen] = useState(false);
  const [isModalUploadOpen, setIsModalUploadOpen] = useState(false);
  const [selectedData, setSelectedData] = useState<DataItem | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedStat, setSelectedStat] = useState<StatType>(null);

  const {
    products,
    loading: productsLoading,
    error: productsError,
  } = useProducts();
  const { sales, loading: salesLoading } = useGetSales();
  const { budgets, loading: loadingBudgets } = useGetBudgets();
  const { orders, loading: loadingOrders } = useOrders();
  const { createSale } = useCreateSale();

  const addProduct = () => setIsModalOpen(true);
  const addSales = () => setIsModalSalesOpen(true);
  const addUpload = () => setIsModalUploadOpen(true);

  const openModal = (data: DataItem) => {
    setSelectedData(data);
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedData(null);
  };
  const closeModalSales = () => setIsModalSalesOpen(false);
  const closeModalUpload = () => setIsModalUploadOpen(false);

  const handleConfirmSale = async (
    cart: CartItem[],
    _customerId?: string,
    _orderId?: string,
  ) => {
    try {
      await createSale(cart);
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

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(filter.toLowerCase()),
  );

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

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar producto por nombre..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Tabla de productos / stock */}
      <ProductsTable products={filteredProducts} onEdit={openModal} />

      {/* Modales (lógica intacta) */}
      <GenericModal isOpen={isModalOpen} onClose={closeModal}>
        <ModalContent
          selectedData={selectedData}
          setSelectedData={setSelectedData}
          closeModalEdit={closeModal}
        />
      </GenericModal>

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
