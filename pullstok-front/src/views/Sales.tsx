import { useState, ChangeEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import DateObject from "react-date-object";
import { Plus, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pagination } from "../components/molecules/pagination";
import { DocumentCard } from "../components/molecules/DocumentCard";
import { useGetSales, useCreateSale } from "../components/hooks/useSales";
import { Loader } from "../components/atoms/loader";
import { SalesDrawer } from "../components/molecules/SalesDrawer";
import { useOrders } from "../components/hooks/useOrder";
import { usePorducts } from "../components/hooks/useProducts";
import { useCustomers, useCreateCustomer } from "../components/hooks/useCustomer";
import { useCreateInvoiceFromSale } from "../components/hooks/useInvoices";
import { toast } from "react-toastify";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";
import { CartItem, Sale } from "../models/salesModel";

const TAX_CONDITIONS = [
  "Responsable Inscripto",
  "Monotributista",
  "Exento",
  "Consumidor Final",
  "No Responsable",
];

type CustomerMode = "select" | "create";

interface InvoiceModalState {
  sale: Sale | null;
  mode: CustomerMode;
  selectedCustomerId: string;
  newName: string;
  newEmail: string;
  newPhone: string;
  newTaxId: string;
  newTaxCondition: string;
  newAddress: string;
  error: string | null;
}

const INITIAL_MODAL: InvoiceModalState = {
  sale: null,
  mode: "select",
  selectedCustomerId: "",
  newName: "",
  newEmail: "",
  newPhone: "",
  newTaxId: "",
  newTaxCondition: "",
  newAddress: "",
  error: null,
};

export const SalesPage = () => {
  const navigate = useNavigate();
  const { sales, loading, error } = useGetSales();
  const { orders } = useOrders();
  const { products } = usePorducts();
  const { createSale } = useCreateSale();
  const { customers } = useCustomers();
  const { submitCustomerAsync, loadingCustomer } = useCreateCustomer();
  const { invoiceFromSale, loadingInvoiceFromSale } = useCreateInvoiceFromSale();

  const [isOpen, setIsOpen] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterProductName, setFilterProductName] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Modal de facturación
  const [modal, setModal] = useState<InvoiceModalState>(INITIAL_MODAL);
  const isModalOpen = !!modal.sale;

  const openInvoiceModal = (sale: Sale) => {
    setModal({ ...INITIAL_MODAL, sale });
  };

  const closeInvoiceModal = () => {
    setModal(INITIAL_MODAL);
  };

  const handleInvoice = async () => {
    if (!modal.sale) return;
    setModal((m) => ({ ...m, error: null }));

    try {
      let customerId: string;

      if (modal.mode === "create") {
        if (!modal.newName.trim()) {
          setModal((m) => ({ ...m, error: "El nombre del cliente es requerido." }));
          return;
        }
        const created = await submitCustomerAsync({
          name: modal.newName.trim(),
          email: modal.newEmail.trim(),
          phone: modal.newPhone.trim(),
          taxId: modal.newTaxId.trim(),
          taxCondition: modal.newTaxCondition.trim(),
          address: modal.newAddress.trim(),
        });
        customerId = created.id || created._id || "";
        if (!customerId) {
          setModal((m) => ({ ...m, error: "No se pudo obtener el ID del cliente creado." }));
          return;
        }
      } else {
        if (!modal.selectedCustomerId) {
          setModal((m) => ({ ...m, error: "Seleccioná un cliente." }));
          return;
        }
        customerId = modal.selectedCustomerId;
      }

      const saleId = modal.sale.id || modal.sale._id || "";
      const invoice = await invoiceFromSale({ saleId, body: { customerId } });

      toast.success("Factura creada en borrador. Ajustá los datos antes de emitirla.");
      closeInvoiceModal();
      navigate(`/facturacion/${invoice.id}/editar`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al facturar la venta.";
      setModal((m) => ({ ...m, error: msg }));
    }
  };

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

  const isSubmitting = loadingCustomer || loadingInvoiceFromSale;

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
            const isInvoiced = !!sale.invoice?.id;

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
                onInvoice={isInvoiced ? undefined : () => openInvoiceModal(sale)}
                badge={
                  isInvoiced ? (
                    <Link to={`/facturacion/${sale.invoice!.id}/editar`}>
                      <Badge variant="secondary" className="cursor-pointer hover:opacity-80">
                        Facturada
                      </Badge>
                    </Link>
                  ) : undefined
                }
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
        warning="Una vez confirmada, la venta descuenta el stock y no se puede editar ni deshacer."
        onConfirm={handleConfirmSale}
      />

      {/* Modal de facturación */}
      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) closeInvoiceModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Facturar venta</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Selector de modo */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={modal.mode === "select" ? "default" : "outline"}
                size="sm"
                onClick={() => setModal((m) => ({ ...m, mode: "select", error: null }))}
              >
                Cliente existente
              </Button>
              <Button
                type="button"
                variant={modal.mode === "create" ? "default" : "outline"}
                size="sm"
                onClick={() => setModal((m) => ({ ...m, mode: "create", error: null }))}
              >
                Crear cliente
              </Button>
            </div>

            {modal.mode === "select" ? (
              <div className="space-y-2">
                <Label htmlFor="invoice-customer">Cliente</Label>
                <Select
                  value={modal.selectedCustomerId}
                  onValueChange={(value) =>
                    setModal((m) => ({ ...m, selectedCustomerId: value }))
                  }
                >
                  <SelectTrigger id="invoice-customer" className="w-full">
                    <SelectValue placeholder="Seleccioná un cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(customers || []).map((c) => {
                      const cId = c.id || c._id || "";
                      return (
                        <SelectItem key={cId} value={cId}>
                          {c.name}
                          {c.taxId ? ` — ${c.taxId}` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="new-customer-name">
                    Nombre <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="new-customer-name"
                    placeholder="Ej: Juan Pérez"
                    value={modal.newName}
                    onChange={(e) =>
                      setModal((m) => ({ ...m, newName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-customer-email">Email</Label>
                  <Input
                    id="new-customer-email"
                    type="email"
                    placeholder="juan@ejemplo.com"
                    value={modal.newEmail}
                    onChange={(e) =>
                      setModal((m) => ({ ...m, newEmail: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-customer-phone">Teléfono</Label>
                  <Input
                    id="new-customer-phone"
                    placeholder="Ej: 11-1234-5678"
                    value={modal.newPhone}
                    onChange={(e) =>
                      setModal((m) => ({ ...m, newPhone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-customer-taxid">CUIT / DNI</Label>
                  <Input
                    id="new-customer-taxid"
                    placeholder="Ej: 20-12345678-9"
                    value={modal.newTaxId}
                    onChange={(e) =>
                      setModal((m) => ({ ...m, newTaxId: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-customer-taxcondition">Condición fiscal</Label>
                  <Select
                    value={modal.newTaxCondition}
                    onValueChange={(value) =>
                      setModal((m) => ({ ...m, newTaxCondition: value }))
                    }
                  >
                    <SelectTrigger id="new-customer-taxcondition" className="w-full">
                      <SelectValue placeholder="Seleccioná..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_CONDITIONS.map((tc) => (
                        <SelectItem key={tc} value={tc}>
                          {tc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-customer-address">Domicilio</Label>
                  <Input
                    id="new-customer-address"
                    placeholder="Ej: Av. Corrientes 1234, CABA"
                    value={modal.newAddress}
                    onChange={(e) =>
                      setModal((m) => ({ ...m, newAddress: e.target.value }))
                    }
                  />
                </div>
              </div>
            )}

            {modal.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {modal.error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeInvoiceModal}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleInvoice}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isSubmitting ? "Procesando..." : "Generar factura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
