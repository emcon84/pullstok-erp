import { IoMdAddCircleOutline } from "react-icons/io";
import Separator from "../components/atoms/separator";
import { Text } from "../components/atoms/text";
import { Title } from "../components/atoms/title";
import { useGetBudgets, useCreateBudget } from "../components/hooks/useBudget";
import { Button } from "../components/molecules/button";
import { Card } from "../components/molecules/card";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { useState, ChangeEvent } from "react";
import { usePorducts } from "../components/hooks/useProducts";
import { useCustomers } from "../components/hooks/useCustomer";
import { Pagination } from "../components/molecules/pagination";
import { Input } from "../components/atoms/inputs";
import { Loader } from "../components/atoms/loader";
import { CartItem } from "../models/salesModel";
import { toast } from "react-toastify";
import { ExportButtons } from "../components/molecules/ExportButtons";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";

export const Quotations = () => {
  const { budgets, error, loading } = useGetBudgets();
  const [isOpen, setIsOpen] = useState(false);
  const { submitBudget } = useCreateBudget();

  const { customers } = useCustomers();
  const { products, getProducts } = usePorducts();

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [filterDate, setFilterDate] = useState<string>("");
  const [filterCustomerName, setFilterCustomerName] = useState<string>("");

  if (loading) {
    return (
      <div className="flex-jc-ac h-100-vh">
        <Loader />
      </div>
    );
  }
  if (error) {
    return <div>Error: {error.message}</div>;
  }

  // Filtrado de presupuestos
  const filteredBudgets = budgets.filter((budget) => {
    const budgetDate = new Date(budget.createdAt).toLocaleDateString("en-CA"); // formato 'YYYY-MM-DD'
    const matchesDate = filterDate ? budgetDate === filterDate : true;
    const matchesCustomer = filterCustomerName
      ? budget.customer.name
          .toLowerCase()
          .includes(filterCustomerName.toLowerCase())
      : true;
    return matchesDate && matchesCustomer;
  });

  // Paginación
  const totalPages = Math.ceil(filteredBudgets.length / itemsPerPage);
  const paginatedBudgets = filteredBudgets.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleDateFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterDate(e.target.value);
  };

  const handleCustomerNameFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterCustomerName(e.target.value);
  };

  const handleConfirmBudget = async (cart: CartItem[], customerId?: string) => {
    if (!customerId) {
      toast.error("Debe seleccionar un cliente");
      return;
    }

    const productsData = cart.map((item) => ({
      product: item.product._id || item.product.id || "",
      quantity: item.quantity,
      price: item.totalPrice / item.quantity,
    }));

    const budgetData = {
      customer: customerId,
      products: productsData,
      totalAmount: cart.reduce((total, item) => total + item.totalPrice, 0),
      validUntil: "2024-12-31",
    };

    try {
      await submitBudget(budgetData);
      toast.success("Presupuesto creado con éxito");
      getProducts();
    } catch (error) {
      toast.error("Error al crear el presupuesto");
      console.error("Error al crear el presupuesto:", error);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const handleExportPDF = (budget: any) => {
    const exportData = {
      title: "Presupuesto",
      documentNumber: budget.receipt,
      date: formatDate(budget.createdAt),
      customer: budget.customer.name,
      items: (budget.items || budget.products).map((item: any) => ({
        quantity: item.quantity,
        name: item.product.name,
        price: item.price,
        total: item.quantity * item.price,
      })),
      total: budget.totalAmount,
    };
    exportToPDF(exportData);
  };

  const handleExportExcel = (budget: any) => {
    const exportData = {
      title: "Presupuesto",
      documentNumber: budget.receipt,
      date: formatDate(budget.createdAt),
      customer: budget.customer.name,
      items: (budget.items || budget.products).map((item: any) => ({
        quantity: item.quantity,
        name: item.product.name,
        price: item.price,
        total: item.quantity * item.price,
      })),
      total: budget.totalAmount,
    };
    exportToExcel(exportData);
  };

  return (
    <div className="p-20">
      <div className="flex-jc-sb">
        <Title level={1} className="header text-xl mx-20">
          Presupuestos
        </Title>
        <Button
          onClick={() => setIsOpen(true)}
          iconLeft={
            <IoMdAddCircleOutline style={{ marginRight: 5 }} size={24} />
          }
        >
          Agregar presupuesto
        </Button>
      </div>
      <Separator orientation="horizontal" color="#ccc" thickness="1px" />
      <br />

      {/* Filtros */}
      <div className="flex gap-10 mx-20">
        <div>
          <label>Filtrar por Fecha: </label>
          <Input
            type="date"
            value={filterDate}
            onChange={handleDateFilterChange}
          />
        </div>
        <div>
          <label>Filtrar por Cliente: </label>
          <Input
            type="text"
            placeholder="Buscar por cliente"
            value={filterCustomerName}
            onChange={handleCustomerNameFilterChange}
          />
        </div>
      </div>

      {/* Mostrar presupuestos filtrados y paginados */}
      {paginatedBudgets.map((budget) => {
        const budgetId = budget.id || budget._id || "";
        return (
          <Card key={budgetId}>
            <div className="flex-jc-sb">
              <div>
                <Title level={4} className="text-bold">
                  N° presupuesto: {budget.receipt}
                </Title>
                <Text type="p" className="text-bold">
                  Cliente: {budget.customer.name}
                </Text>
              </div>
              <div>
                <p>Válido hasta: {formatDate(budget.validUntil)}</p>
                <p>Creado: {formatDate(budget.createdAt)}</p>
              </div>
              <div>
                <ExportButtons
                  onExportPDF={() => handleExportPDF(budget)}
                  onExportExcel={() => handleExportExcel(budget)}
                />
              </div>
            </div>
            <Separator orientation="horizontal" color="#ddd" thickness="1px" />
            <table className="budget-table">
              <thead>
                <tr>
                  <th>Cantidad</th>
                  <th>Descripción de Producto</th>
                  <th>Precio Unitario</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(budget.items || budget.products)?.map((item) => {
                  const productId = item.product.id || item.product._id || "";
                  const itemTotal = item.quantity * item.price;
                  return (
                    <tr key={productId}>
                      <td style={{ textAlign: "center" }}>{item.quantity}</td>
                      <td>{item.product.name}</td>
                      <td style={{ textAlign: "right" }}>
                        ${item.price.toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        ${itemTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="budget-total-row">
                  <td
                    colSpan={3}
                    style={{ textAlign: "right", fontWeight: "bold" }}
                  >
                    Total:
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: "bold",
                      fontSize: "20px",
                      color: "var(--primary-color)",
                    }}
                  >
                    ${budget.totalAmount.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        );
      })}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />

      <SalesDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        products={products}
        customers={customers}
        title="Crear Presupuesto"
        requireCustomer={true}
        onConfirm={handleConfirmBudget}
      />
    </div>
  );
};
