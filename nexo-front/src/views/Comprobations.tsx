import { useState, ChangeEvent } from "react";
import { Title } from "../components/atoms/title";
import { Card } from "../components/molecules/card";
import { Input } from "../components/atoms/inputs";
import Separator from "../components/atoms/separator";
import { Pagination } from "../components/molecules/pagination";
import {
  useGetReceipts,
  useCreateReceipt,
} from "../components/hooks/useReceipt";
import { Loader } from "../components/atoms/loader";
import { Button } from "../components/molecules/button";
import { IoMdAddCircleOutline } from "react-icons/io";
import { Drawer } from "../components/molecules/Drawer";
import { useGetSales } from "../components/hooks/useSales";
import { Sale } from "../models/salesModel";
import { toast } from "react-toastify";
import { Text } from "../components/atoms/text";
import { ExportButtons } from "../components/molecules/ExportButtons";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";

export const Comprobations = () => {
  const { receipts, loading, error } = useGetReceipts();
  const { sales } = useGetSales();
  const { createReceipt } = useCreateReceipt();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterReceiptNumber, setFilterReceiptNumber] = useState<string>("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Filtrado de remitos
  const filteredReceipts = receipts.filter((receipt) => {
    const receiptDate = new Date(receipt.createdAt).toLocaleDateString("en-CA");
    const matchesDate = filterDate ? receiptDate === filterDate : true;
    const matchesReceiptNumber = filterReceiptNumber
      ? receipt.receiptNumber
          .toLowerCase()
          .includes(filterReceiptNumber.toLowerCase())
      : true;
    return matchesDate && matchesReceiptNumber;
  });

  // Paginación
  const totalPages = Math.ceil(filteredReceipts.length / itemsPerPage);
  const paginatedReceipts = filteredReceipts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleDateFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilterDate(e.target.value);
  };

  const handleReceiptNumberFilterChange = (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    setFilterReceiptNumber(e.target.value.toLowerCase());
  };

  const handleCreateReceipt = async () => {
    if (selectedSaleId) {
      try {
        await createReceipt({ relatedDocument: selectedSaleId });
        toast.success("Remito creado con éxito");
        setIsOpen(false);
        setSelectedSaleId(null);
      } catch (error) {
        toast.error("Error al crear el remito");
        console.error("Error al crear el remito:", error);
      }
    }
  };

  // Obtener la venta seleccionada para mostrar el resumen
  const selectedSale = sales?.find(
    (sale) => (sale.id || sale._id) === selectedSaleId,
  );

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const handleExportPDF = (receipt: any) => {
    const exportData = {
      title: "Remito",
      documentNumber: receipt.receiptNumber || receipt.id || "",
      date: formatDate(receipt.createdAt),
      customer: receipt.relatedDocument?.customer?.name || "",
      items: (receipt.relatedDocument?.items || []).map((item: any) => ({
        quantity: item.quantity,
        name: item.name || "",
        price: item.price,
        total: item.quantity * item.price,
      })),
      total: receipt.relatedDocument?.totalAmount || 0,
    };
    exportToPDF(exportData);
  };

  const handleExportExcel = (receipt: any) => {
    const exportData = {
      title: "Remito",
      documentNumber: receipt.receiptNumber || receipt.id || "",
      date: formatDate(receipt.createdAt),
      customer: receipt.relatedDocument?.customer?.name || "",
      items: (receipt.relatedDocument?.items || []).map((item: any) => ({
        quantity: item.quantity,
        name: item.name || "",
        price: item.price,
        total: item.quantity * item.price,
      })),
      total: receipt.relatedDocument?.totalAmount || 0,
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
    return <div>Error al cargar remitos: {error.message}</div>;
  }

  return (
    <div className="p-20">
      <div className="flex-jc-sb">
        <Title level={1} className="header text-xl mx-20">
          Remitos de Entrega
        </Title>
        <Button
          onClick={() => setIsOpen(true)}
          iconLeft={
            <IoMdAddCircleOutline style={{ marginRight: 5 }} size={24} />
          }
        >
          Agregar remito
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
          <label>Filtrar por N° Remito: </label>
          <Input
            type="text"
            placeholder="Buscar por número"
            value={filterReceiptNumber}
            onChange={handleReceiptNumberFilterChange}
          />
        </div>
      </div>

      {/* Mostrar remitos filtrados y paginados */}
      {paginatedReceipts.map((receipt) => {
        const receiptId = receipt.id || receipt._id || "";
        const sale = receipt.sale;

        return (
          <Card key={receiptId}>
            <div className="flex-jc-sb">
              <div>
                <Title level={4} className="text-bold">
                  Remito N°: {receipt.receiptNumber}
                </Title>
                <Text type="p" className="text-bold">
                  Fecha:{" "}
                  {new Date(receipt.createdAt).toLocaleDateString("es-ES")}
                </Text>
              </div>
              <div>
                <ExportButtons
                  onExportPDF={() => handleExportPDF(receipt)}
                  onExportExcel={() => handleExportExcel(receipt)}
                />
              </div>
            </div>
            <Separator orientation="horizontal" color="#ddd" thickness="1px" />

            {sale && (
              <>
                <div style={{ margin: "16px 0" }}>
                  <Text type="p">
                    Cliente: {sale.customer?.name || "Sin cliente"}
                  </Text>
                </div>

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
                      const productId =
                        product.product?.id || product.product?._id || "";
                      const itemTotal = product.quantity * product.price;
                      return (
                        <tr key={productId}>
                          <td style={{ textAlign: "center" }}>
                            {product.quantity}
                          </td>
                          <td>{product.product?.name}</td>
                          <td style={{ textAlign: "right" }}>
                            ${product.price.toFixed(2)}
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
              </>
            )}
          </Card>
        );
      })}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />

      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Crear Remito"
        width="700px"
      >
        <div className="p-20">
          <label
            htmlFor="sale-select"
            style={{ display: "block", marginBottom: "10px" }}
          >
            Seleccionar Venta
          </label>
          <select
            id="sale-select"
            value={selectedSaleId || ""}
            onChange={(e) => setSelectedSaleId(e.target.value)}
            className="select-element"
            style={{ width: "100%", marginBottom: "20px" }}
          >
            <option value="" disabled>
              Seleccionar venta
            </option>
            {sales &&
              sales.map((sale: Sale) => {
                const saleId = sale.id || sale._id || "";
                return (
                  <option key={saleId} value={saleId}>
                    Venta {new Date(sale.saleDate).toLocaleDateString("es-ES")}{" "}
                    - ${sale.totalAmount}
                  </option>
                );
              })}
          </select>

          {/* Resumen de la venta seleccionada */}
          {selectedSale && (
            <div style={{ marginBottom: "20px" }}>
              <Title level={3}>Resumen del Remito</Title>
              <Separator
                orientation="horizontal"
                color="#ddd"
                thickness="1px"
              />
              <div style={{ margin: "16px 0" }}>
                <Text type="p" className="text-bold">
                  Fecha de Venta:{" "}
                  {new Date(selectedSale.saleDate).toLocaleDateString("es-ES")}
                </Text>
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
                  {(selectedSale.items || selectedSale.products || []).map(
                    (item) => {
                      const productId = item.id || item._id || "";
                      const itemTotal =
                        (item.quantity || 1) * (item.price || 0);
                      return (
                        <tr key={productId}>
                          <td style={{ textAlign: "center" }}>
                            {item.quantity || 1}
                          </td>
                          <td>{item.name}</td>
                          <td style={{ textAlign: "right" }}>
                            ${(item.price || 0).toFixed(2)}
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
                      ${selectedSale.totalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <Button
            onClick={handleCreateReceipt}
            disabled={!selectedSaleId}
            style={{ width: "100%" }}
          >
            Crear Remito
          </Button>
        </div>
      </Drawer>
    </div>
  );
};
