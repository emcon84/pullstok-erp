import React, { useState, ChangeEvent } from "react";
import { useCreateOrder, useOrders } from "../components/hooks/useOrder";
import { useGetBudgetByID, useGetBudgets } from "../components/hooks/useBudget";
import { Order } from "../models/orderModel";
import { Title } from "../components/atoms/title";
import Separator from "../components/atoms/separator";
import { Card } from "../components/molecules/card";
import { Text } from "../components/atoms/text";
import { Button } from "../components/molecules/button";
import { IoMdAddCircleOutline } from "react-icons/io";
import { Drawer } from "../components/molecules/Drawer";
import { Budget } from "../models/budgetModel";
import { toast } from "react-toastify";
import { Pagination } from "../components/molecules/pagination";
import { Input } from "../components/atoms/inputs";
import { Loader } from "../components/atoms/loader";
import { ExportButtons } from "../components/molecules/ExportButtons";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";

export const Orders: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const { orders, loading, error } = useOrders();
  const { budgets } = useGetBudgets(); // Obtener todos los presupuestos
  const { submitOrder: createOrder } = useCreateOrder();

  // Filtros
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterCustomerName, setFilterCustomerName] = useState<string>("");
  const [filterReceipt, setFilterReceipt] = useState<string>("");

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Manejo de filtros
  const filteredOrders = orders.filter((order) => {
    const orderDate = new Date(order.createdAt).toLocaleDateString("en-CA");
    const matchesDate = filterDate ? orderDate === filterDate : true;
    const matchesCustomer = filterCustomerName
      ? order.customer &&
        order.customer.name.toLowerCase().includes(filterCustomerName)
      : true;
    // const matchtsBudget = order.receipt ? budgets?.some(budget => budget.receipt === order.receipt) : true;
    const matchesReceipt = filterReceipt
      ? order.receipt?.toLowerCase().includes(filterReceipt.toLowerCase())
      : true;
    return matchesDate && matchesCustomer && matchesReceipt;
  });

  // Paginación
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleCreateOrder = () => {
    if (selectedBudgetId) {
      const selectedBudget = budgets?.find(
        (budget) => (budget.id || budget._id) === selectedBudgetId,
      );
      if (selectedBudget) {
        const budgetId = selectedBudget.id || selectedBudget._id || "";
        const customerId =
          selectedBudget.customer.id || selectedBudget.customer._id || "";
        createOrder({
          customer: customerId,
          quotationId: budgetId,
          type: "sale",
        });
        setIsOpen(false);
        toast.success("Se ha creado el pedido correctamente");
        setSelectedBudgetId(null);
      }
    }
  };

  const handleDateFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterDate(e.target.value);
  };

  const handleCustomerNameFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterCustomerName(e.target.value.toLowerCase());
  };
  const handleBudgetFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterReceipt(e.target.value.toLowerCase());
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Obtener el presupuesto seleccionado para mostrar el resumen
  const selectedBudget = budgets?.find(
    (budget) => (budget.id || budget._id) === selectedBudgetId,
  );

  if (loading) {
    return (
      <div className="flex-jc-ac h-100-vh">
        <Loader />
      </div>
    );
  }
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="p-20">
      <div className="flex-jc-sb">
        <Title level={1} className="header text-xl mx-20">
          Pedidos
        </Title>
        <Button
          onClick={() => setIsOpen(true)}
          iconLeft={
            <IoMdAddCircleOutline style={{ marginRight: 5 }} size={24} />
          }
        >
          Agregar pedido
        </Button>
      </div>

      <Separator orientation="horizontal" color="#ccc" thickness="1px" />

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
        <div>
          <label>Filtrar por Presupuesto: </label>
          <Input
            type="text"
            placeholder="Buscar por cliente"
            value={filterReceipt}
            onChange={handleBudgetFilterChange}
          />
        </div>
      </div>

      {/* Mostrar pedidos filtrados y paginados */}
      {paginatedOrders.map((order) => {
        const orderId = order.id || order._id || "";
        return <OrderDetail key={orderId} order={order} />;
      })}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />

      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Crear Pedido"
        width="700px"
      >
        <div className="p-20">
          <label
            htmlFor="budget-select"
            style={{ display: "block", marginBottom: "10px" }}
          >
            Seleccionar Presupuesto
          </label>
          <select
            id="budget-select"
            value={selectedBudgetId || ""}
            onChange={(e) => setSelectedBudgetId(e.target.value)}
            className="select-element"
            style={{ width: "100%", marginBottom: "20px" }}
          >
            <option value="" disabled>
              Seleccionar presupuesto
            </option>
            {budgets &&
              budgets.map((budget: Budget) => {
                const budgetId = budget.id || budget._id || "";
                return (
                  <option key={budgetId} value={budgetId}>
                    {budget.receipt} - {budget.customer.name}
                  </option>
                );
              })}
          </select>

          {/* Resumen del presupuesto seleccionado */}
          {selectedBudget && (
            <div style={{ marginBottom: "20px" }}>
              <Title level={3}>Resumen del Pedido</Title>
              <Separator
                orientation="horizontal"
                color="#ddd"
                thickness="1px"
              />
              <div style={{ margin: "16px 0" }}>
                <Text type="p" className="text-bold">
                  Cliente: {selectedBudget.customer.name}
                </Text>
                <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                  Presupuesto N°: {selectedBudget.receipt}
                </p>
              </div>

              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Cantidad</th>
                    <th>Descripción</th>
                    <th>Precio Unit.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedBudget.items || selectedBudget.products)?.map(
                    (item) => {
                      const productId =
                        item.product.id || item.product._id || "";
                      const itemTotal = item.quantity * item.price;
                      return (
                        <tr key={productId}>
                          <td style={{ textAlign: "center" }}>
                            {item.quantity}
                          </td>
                          <td>{item.product.name}</td>
                          <td style={{ textAlign: "right" }}>
                            ${item.price.toFixed(2)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            ${itemTotal.toFixed(2)}
                          </td>
                        </tr>
                      );
                    },
                  )}
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
                      ${selectedBudget.totalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <Button
            onClick={handleCreateOrder}
            disabled={!selectedBudgetId}
            style={{ width: "100%" }}
          >
            Crear Pedido
          </Button>
        </div>
      </Drawer>
    </div>
  );
};

interface OrderDetailProps {
  order: Order;
}

const OrderDetail: React.FC<OrderDetailProps> = ({ order }) => {
  const {
    data: budget,
    isLoading,
    error,
  } = useGetBudgetByID(order.quotation || "");

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const handleExportPDF = (order: any) => {
    const exportData = {
      title: "Pedido",
      documentNumber: order.receipt || order.id || "",
      date: formatDate(order.createdAt),
      customer: order.customer?.name || "",
      items: (order.items || order.products || []).map((item: any) => ({
        quantity: item.quantity,
        name: item.product?.name || item.name || "",
        price: item.price,
        total: item.quantity * item.price,
      })),
      total: order.totalAmount || 0,
    };
    exportToPDF(exportData);
  };

  const handleExportExcel = (order: any) => {
    const exportData = {
      title: "Pedido",
      documentNumber: order.receipt || order.id || "",
      date: formatDate(order.createdAt),
      customer: order.customer?.name || "",
      items: (order.items || order.products || []).map((item: any) => ({
        quantity: item.quantity,
        name: item.product?.name || item.name || "",
        price: item.price,
        total: item.quantity * item.price,
      })),
      total: order.totalAmount || 0,
    };
    exportToExcel(exportData);
  };

  if (isLoading) {
    return (
      <div className="flex-jc-ac h-100-vh">
        <Loader />
      </div>
    );
  }
  if (error) return <div>Error fetching budget: {error.message}</div>;

  return (
    <div>
      <Card key={order.id || order._id}>
        <div className="flex-jc-sb">
          <div>
            <Title level={4} className="text-bold">
              N° Pedido: {order.receipt}
            </Title>
            <Text type="p" className="text-bold">
              Cliente: {budget?.customer.name || "Desconocido"}
            </Text>
          </div>
          <div>
            <p>Creado: {formatDate(order.createdAt)}</p>
          </div>
          <div>
            <ExportButtons
              onExportPDF={() => handleExportPDF(order)}
              onExportExcel={() => handleExportExcel(order)}
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
            {(order.items || order.products)?.map((item) => {
              const productId = item.product?.id || item.product?._id || "";
              const itemTotal = item.quantity * item.price;
              return (
                <tr key={productId}>
                  <td style={{ textAlign: "center" }}>{item.quantity}</td>
                  <td>{item.product?.name}</td>
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
                ${order.totalAmount.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
};
