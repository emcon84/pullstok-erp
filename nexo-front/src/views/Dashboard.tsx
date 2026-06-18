import { useState } from "react";
import { GenericTable } from "../components/molecules/GenericTable";
import { Title } from "../components/atoms/title";
import { IoMdAddCircleOutline } from "react-icons/io";
import {
  FaShoppingCart,
  FaFileInvoice,
  FaBox,
  FaReceipt,
} from "react-icons/fa";
import { Button } from "../components/molecules/button";
import { GenericModal } from "../components/molecules/GenericModal";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { StatCard } from "../components/molecules/StatCard";
import { Statistics } from "./Statistics";
import { columns } from "../helpers";
import "./Dashboard.css"; // CSS
import { useProducts } from "../components/hooks/useProducts";
import { ModalContent } from "../components/molecules/GenericModal/ModalContent";
import Separator from "../components/atoms/separator";
import { DataItem } from "../types";
import { useGetSales, useCreateSale } from "../components/hooks/useSales";
import { Loader } from "../components/atoms/loader";
import { ModalContentUploadCsv } from "../components/molecules/GenericModal/ModalContentUploadCsv";
import { Input } from "../components/atoms/inputs";
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
  const [filter, setFilter] = useState(""); // Estado para el filtro de búsqueda
  const [selectedStat, setSelectedStat] = useState<StatType>(null);

  const {
    products,
    loading: productsLoading,
    error: productsError,
  } = useProducts();
  const { sales, loading: salesLoading, error: salesError } = useGetSales();
  const { budgets, loading: loadingBudgets } = useGetBudgets();
  const { orders, loading: loadingOrders } = useOrders();
  const { createSale } = useCreateSale();

  const addProduct = () => {
    setIsModalOpen(true);
  };

  const addSales = () => {
    setIsModalSalesOpen(true);
  };

  const addUpload = () => {
    setIsModalUploadOpen(true);
  };

  const openModal = (data: DataItem) => {
    setSelectedData(data);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedData(null);
  };

  const closeModalSales = () => {
    setIsModalSalesOpen(false);
  };

  const closeModalUpload = () => {
    setIsModalUploadOpen(false);
  };

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
      <div className="flex-jc-ac h-100-vh">
        <Loader />
      </div>
    );
  }

  if (productsError) {
    return <div>Error loading products: {productsError.message}</div>;
  }

  if (salesLoading) {
    return <div>Loading sales...</div>;
  }
  if (salesError) {
    return <div>Error loading sales: {salesError.message}</div>;
  }

  // Filtrar productos por el filtro de búsqueda
  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(filter.toLowerCase()),
  );

  // Si hay una estadística seleccionada, mostrar la vista de estadísticas
  if (selectedStat) {
    return (
      <Statistics type={selectedStat} onBack={() => setSelectedStat(null)} />
    );
  }

  return (
    <div className="dashboard">
      <Title level={1} className="header text-xl mx-20">
        Dashboard
      </Title>
      <Separator orientation="horizontal" color="#ccc" thickness="1px" />

      <div className="cards-dashboard_heading">
        <StatCard
          title="Total de Ventas"
          value={sales.length}
          subtitle="Click para ver estadísticas"
          icon={<FaShoppingCart />}
          color="success"
          onClick={() => setSelectedStat("sales")}
          loading={salesLoading}
        />
        <StatCard
          title="Total Presupuestos"
          value={budgets.length}
          subtitle="Click para ver estadísticas"
          icon={<FaFileInvoice />}
          color="primary"
          onClick={() => setSelectedStat("budgets")}
          loading={loadingBudgets}
        />
        <StatCard
          title="Total Pedidos"
          value={orders.length}
          subtitle="Click para ver estadísticas"
          icon={<FaBox />}
          color="warning"
          onClick={() => setSelectedStat("orders")}
          loading={loadingOrders}
        />
        <StatCard
          title="Total de Productos"
          value={products.length}
          subtitle="En inventario"
          icon={<FaReceipt />}
          color="info"
        />
      </div>

      <div className="add-product-button">
        <Button
          onClick={addProduct}
          iconLeft={
            <IoMdAddCircleOutline style={{ marginRight: 5 }} size={24} />
          }
        >
          Agregar producto
        </Button>
        <Button
          onClick={addUpload}
          iconLeft={
            <IoMdAddCircleOutline style={{ marginRight: 5 }} size={24} />
          }
        >
          Agregar productos desde csv
        </Button>
        <Button
          onClick={addSales}
          iconLeft={
            <IoMdAddCircleOutline style={{ marginRight: 5 }} size={24} />
          }
        >
          Nueva Venta
        </Button>
      </div>

      {/* Input para el filtro de búsqueda */}
      <div className="px-20">
        <Input
          type="text"
          placeholder="Buscar por nombre de producto"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {/* Usar los productos filtrados en la tabla */}
      <GenericTable
        columns={columns}
        data={filteredProducts}
        onRowDoubleClick={openModal}
      />

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
        onConfirm={handleConfirmSale}
      />

      <GenericModal isOpen={isModalUploadOpen} onClose={closeModalUpload}>
        <ModalContentUploadCsv />
      </GenericModal>
    </div>
  );
};
