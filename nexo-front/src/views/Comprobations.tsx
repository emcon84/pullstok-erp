import { useState, ChangeEvent } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Pagination } from "../components/molecules/pagination";
import { DocumentCard } from "../components/molecules/DocumentCard";
import {
  useGetReceipts,
  useCreateReceipt,
} from "../components/hooks/useReceipt";
import { Loader } from "../components/atoms/loader";
import { Drawer } from "../components/molecules/Drawer";
import { useGetSales } from "../components/hooks/useSales";
import { Sale } from "../models/salesModel";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

const formatDate = (date: string | Date) =>
  new Date(date).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapItems = (items: any[]) =>
  (items || []).map((p) => ({
    quantity: p.quantity,
    name: p.product?.name || p.name,
    price: p.price,
    total: (p.quantity ?? 1) * (p.price ?? 0),
  }));

export const Comprobations = () => {
  const { receipts, loading, error } = useGetReceipts();
  const { sales } = useGetSales();
  const { createReceipt } = useCreateReceipt();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState("");
  const [filterReceiptNumber, setFilterReceiptNumber] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

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

  const totalPages = Math.ceil(filteredReceipts.length / itemsPerPage);
  const paginatedReceipts = filteredReceipts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

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

  const selectedSale = sales?.find(
    (sale) => (sale.id || sale._id) === selectedSaleId,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildExport = (receipt: any) => ({
    title: "Remito",
    documentNumber: receipt.receiptNumber || receipt.id || "",
    date: formatDate(receipt.createdAt),
    customer: receipt.relatedDocument?.customer?.name || "",
    items: mapItems(receipt.relatedDocument?.items || []),
    total: receipt.relatedDocument?.totalAmount || 0,
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
        Error al cargar remitos: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Remitos</h1>
          <p className="text-sm text-muted-foreground">
            {filteredReceipts.length} remito
            {filteredReceipts.length === 1 ? "" : "s"} de entrega
          </p>
        </div>
        <Button onClick={() => setIsOpen(true)}>
          <Plus className="h-4 w-4" />
          Agregar remito
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="r-date">Filtrar por fecha</Label>
          <Input
            id="r-date"
            type="date"
            className="w-auto"
            value={filterDate}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFilterDate(e.target.value)
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-number">Filtrar por N° remito</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="r-number"
              className="pl-9 sm:w-56"
              placeholder="Buscar por número"
              value={filterReceiptNumber}
              onChange={(e) =>
                setFilterReceiptNumber(e.target.value.toLowerCase())
              }
            />
          </div>
        </div>
      </div>

      {paginatedReceipts.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          No hay remitos para mostrar.
        </Card>
      ) : (
        <div className="space-y-4">
          {paginatedReceipts.map((receipt) => {
            const receiptId = receipt.id || receipt._id || "";
            const sale = receipt.sale;
            return (
              <DocumentCard
                key={receiptId}
                label="Remito"
                title={`N° ${receipt.receiptNumber}`}
                subtitle={`Fecha: ${formatDate(receipt.createdAt)}${
                  sale?.customer?.name ? ` · Cliente: ${sale.customer.name}` : ""
                }`}
                items={mapItems(sale?.items || sale?.products || [])}
                total={sale?.totalAmount || 0}
                onExportPDF={() => exportToPDF(buildExport(receipt))}
                onExportExcel={() => exportToExcel(buildExport(receipt))}
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

      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Crear Remito"
        width="700px"
      >
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="sale-select">Seleccionar venta</Label>
            <select
              id="sale-select"
              value={selectedSaleId || ""}
              onChange={(e) => setSelectedSaleId(e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                Seleccionar venta
              </option>
              {sales?.map((sale: Sale) => {
                const saleId = sale.id || sale._id || "";
                return (
                  <option key={saleId} value={saleId}>
                    Venta {formatDate(sale.saleDate)} - ${sale.totalAmount}
                  </option>
                );
              })}
            </select>
          </div>

          {selectedSale && (
            <DocumentCard
              label="Resumen del remito"
              title={`Venta del ${formatDate(selectedSale.saleDate)}`}
              items={mapItems(selectedSale.items || selectedSale.products || [])}
              total={selectedSale.totalAmount}
            />
          )}

          <Button
            className="w-full"
            onClick={handleCreateReceipt}
            disabled={!selectedSaleId}
          >
            Crear remito
          </Button>
        </div>
      </Drawer>
    </div>
  );
};
