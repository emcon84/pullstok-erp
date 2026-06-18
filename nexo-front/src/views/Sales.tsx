import { useState, ChangeEvent } from "react";
import { Title } from "../components/atoms/title";
import DateObject from "react-date-object";
import { Card } from "../components/molecules/card";
import { Input } from "../components/atoms/inputs";
import Separator from "../components/atoms/separator";
import { Pagination } from "../components/molecules/pagination";
import { useGetSales, useCreateSale } from "../components/hooks/useSales";
import { Loader } from "../components/atoms/loader";
import { Button } from "../components/molecules/button";
import { IoMdAddCircleOutline } from "react-icons/io";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { useOrders } from "../components/hooks/useOrder";
import { usePorducts } from "../components/hooks/useProducts";
import { toast } from "react-toastify";
import { ExportButtons } from "../components/molecules/ExportButtons";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";
import { CartItem } from "../models/salesModel";

export const SalesPage = () => {
  const { sales, loading, error } = useGetSales();
  const { orders } = useOrders();
  const { products } = usePorducts();
  const { createSale } = useCreateSale();
  const [isOpen, setIsOpen] = useState(false);
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterProductName, setFilterProductName] = useState<string>("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Filtrado de ventas
  const filteredSales = sales.filter((sale) => {
    const matchesDate = filterDate
      ? new DateObject(sale.saleDate).format("YYYY-MM-DD") === filterDate
      : true;
    const products = sale.items || sale.products || [];
    const matchesProduct = filterProductName
      ? products.some((product) =>
          product.name.toLowerCase().includes(filterProductName),
        )
      : true;
    return matchesDate && matchesProduct;
  });

  // Paginación
  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleDateFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterDate(e.target.value);
  };

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

  const handleProductNameFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterProductName(e.target.value.toLowerCase());
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const handleExportPDF = (sale: any) => {
    const exportData = {
      title: "Venta",
      documentNumber: sale.receipt || sale.id || "",
      date: formatDate(sale.createdAt),
      customer: sale.customer?.name || "",
      items: (sale.items || []).map((item: any) => ({
        quantity: item.quantity,
        name: item.name || "",
        price: item.price,
        total: item.quantity * item.price,
      })),
      total: sale.totalAmount || 0,
    };
    exportToPDF(exportData);
  };

  const handleExportExcel = (sale: any) => {
    const exportData = {
      title: "Venta",
      documentNumber: sale.receipt || sale.id || "",
      date: formatDate(sale.createdAt),
      customer: sale.customer?.name || "",
      items: (sale.items || []).map((item: any) => ({
        quantity: item.quantity,
        name: item.name || "",
        price: item.price,
        total: item.quantity * item.price,
      })),
      total: sale.totalAmount || 0,
    };
    exportToExcel(exportData);
  };

  if (loading) {
    return (
      <div className="flex-jc-ac h-100-vh">
        <Loader />
      </div>
    );
  }

  if (error) {
    return <div>Error al cargar ventas: {error.message}</div>;
  }

  return (
    <div className="p-20">
      <div className="flex-jc-sb">
        <Title level={1} className="header text-xl mx-20">
          Ventas
        </Title>
        <Button
          onClick={() => setIsOpen(true)}
          iconLeft={
            <IoMdAddCircleOutline style={{ marginRight: 5 }} size={24} />
          }
        >
          Agregar venta
        </Button>
      </div>
      <Separator orientation="horizontal" color="#ccc" thickness="1px" />

      {/* Filtro por fecha */}
      <div className="flex gap-10 mx-20">
        <div>
          <label>Filtrar por Fecha: </label>
          <Input
            type="date"
            value={filterDate}
            onChange={handleDateFilterChange}
          />
        </div>

        {/* Filtro por nombre de producto */}
        <div>
          <label>Filtrar por Nombre de Producto: </label>
          <Input
            type="text"
            placeholder="Buscar por producto"
            value={filterProductName}
            onChange={handleProductNameFilterChange}
          />
        </div>
      </div>

      {/* Mostrar ventas filtradas y paginadas */}
      {paginatedSales.map((sale) => {
        const saleId = sale.id || sale._id || "";
        return (
          <Card key={saleId}>
            <div className="flex-jc-sb">
              <div>
                <Title level={4} className="text-bold">
                  Fecha: {new DateObject(sale.saleDate).format("DD-MM-YYYY")}
                </Title>
              </div>
              <div>
                <ExportButtons
                  onExportPDF={() => handleExportPDF(sale)}
                  onExportExcel={() => handleExportExcel(sale)}
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
                {(sale.items || sale.products || []).map((product) => {
                  const productId = product.id || product._id || "";
                  const itemTotal =
                    (product.quantity || 1) * (product.price || 0);
                  return (
                    <tr key={productId}>
                      <td style={{ textAlign: "center" }}>
                        {product.quantity || 1}
                      </td>
                      <td>{product.name}</td>
                      <td style={{ textAlign: "right" }}>
                        ${(product.price || 0).toFixed(2)}
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
                    ${sale.totalAmount.toFixed(2)}
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
        products={products || []}
        orders={orders || []}
        title="Crear Venta"
        allowOrderSelection={true}
        onConfirm={handleConfirmSale}
      />
    </div>
  );
};
