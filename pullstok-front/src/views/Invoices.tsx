import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Plus, Eye, Pencil, FileCheck2, CircleDollarSign, Ban, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader } from "../components/atoms/loader";
import {
  useGetInvoices,
  useIssueInvoice,
  useMarkInvoiceAsPaid,
  useCancelInvoice,
} from "../components/hooks/useInvoices";
import { Invoice, InvoiceStatus, PaymentStatus } from "../models/invoiceModel";
import { useConfirm } from "../components/hooks/useConfirm";
import { exportToPDF } from "../utils/exportToPDF";

/**
 * Módulo Facturación de Servicios (sdd/facturacion-servicios, WS4).
 * Lista de Invoice con acciones por estado: ver/editar (solo DRAFT)/
 * emitir (DRAFT)/cobrar (ISSUED+PENDING)/cancelar (ISSUED)/PDF.
 * No toca el sidebar (eso es WS3) — se accede por la ruta directa
 * /facturacion.
 */

const formatDate = (date?: string | null) =>
  date
    ? new Date(date).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "-";

const formatCurrency = (amount: number) =>
  amount.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

const STATUS_VARIANT: Record<InvoiceStatus, "secondary" | "default" | "destructive"> = {
  DRAFT: "secondary",
  ISSUED: "default",
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  CANCELLED: "Cancelada",
};

const PAYMENT_VARIANT: Record<PaymentStatus, "secondary" | "default" | "destructive"> = {
  PENDING: "secondary",
  PAID: "default",
  OVERDUE: "destructive",
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  PAID: "Cobrada",
  OVERDUE: "Vencida",
};

const buildExport = (invoice: Invoice) => ({
  title: "Factura",
  documentNumber: invoice.number || "Borrador",
  date: formatDate(invoice.issueDate),
  customer: invoice.customer?.name,
  items: invoice.items.map((item) => ({
    quantity: item.quantity,
    name: item.description,
    price: item.unitPrice,
    total: item.lineTotal ?? item.quantity * item.unitPrice,
  })),
  total: invoice.totalAmount,
});

export const Invoices = () => {
  const navigate = useNavigate();
  const { invoices, loadingInvoices, errorInvoices } = useGetInvoices();
  const { issueInvoice, loadingIssue } = useIssueInvoice();
  const { markAsPaid, loadingMarkAsPaid } = useMarkInvoiceAsPaid();
  const { cancelInvoice, loadingCancel } = useCancelInvoice();
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const confirm = useConfirm();

  const handleIssue = async (invoice: Invoice) => {
    const ok = await confirm({
      title: "¿Emitir factura?",
      description: `Vas a emitir la factura de ${invoice.customer?.name}. Una vez emitida no se podrá editar.`,
      confirmLabel: "Sí, emitir",
    });
    if (!ok) return;
    setPendingActionId(invoice.id);
    issueInvoice(invoice.id, {
      onSuccess: () => toast.success("Factura emitida con éxito"),
      onError: (error) => toast.error(error.message),
      onSettled: () => setPendingActionId(null),
    });
  };

  const handleMarkAsPaid = (invoice: Invoice) => {
    setPendingActionId(invoice.id);
    markAsPaid(invoice.id, {
      onSuccess: () => toast.success("Factura marcada como cobrada"),
      onError: (error) => toast.error(error.message),
      onSettled: () => setPendingActionId(null),
    });
  };

  const handleCancel = async (invoice: Invoice) => {
    const ok = await confirm({
      title: "¿Cancelar factura?",
      description: `Vas a cancelar la factura ${invoice.number}. Esta acción no se puede revertir.`,
      confirmLabel: "Sí, cancelar",
      danger: true,
    });
    if (!ok) return;
    setPendingActionId(invoice.id);
    cancelInvoice(invoice.id, {
      onSuccess: () => toast.success("Factura cancelada"),
      onError: (error) => toast.error(error.message),
      onSettled: () => setPendingActionId(null),
    });
  };

  if (loadingInvoices) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (errorInvoices) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar facturas: {errorInvoices.message}
      </div>
    );
  }

  const isRowBusy = (id: string) =>
    pendingActionId === id && (loadingIssue || loadingMarkAsPaid || loadingCancel);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
          <p className="text-sm text-muted-foreground">
            {invoices.length} factura{invoices.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => navigate("/facturacion/nueva")}>
          <Plus className="h-4 w-4" />
          Nueva factura
        </Button>
      </div>

      {invoices.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay facturas</p>
          <p className="text-sm text-muted-foreground">
            Creá la primera para empezar a facturar tus servicios.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Emisión</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Cobro</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const busy = isRowBusy(invoice.id);
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.number || "Borrador"}
                    </TableCell>
                    <TableCell>{invoice.customer?.name || "-"}</TableCell>
                    <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(invoice.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[invoice.status]}>
                        {STATUS_LABEL[invoice.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invoice.status === "CANCELLED" ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : (
                        <Badge variant={PAYMENT_VARIANT[invoice.paymentStatus]}>
                          {PAYMENT_LABEL[invoice.paymentStatus]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Ver detalle"
                          onClick={() => navigate(`/facturacion/${invoice.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {invoice.status === "DRAFT" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Editar"
                              onClick={() => navigate(`/facturacion/${invoice.id}/editar`)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Emitir"
                              disabled={busy}
                              onClick={() => handleIssue(invoice)}
                            >
                              <FileCheck2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {invoice.status === "ISSUED" && invoice.paymentStatus !== "PAID" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Marcar como cobrada"
                            disabled={busy}
                            onClick={() => handleMarkAsPaid(invoice)}
                          >
                            <CircleDollarSign className="h-4 w-4" />
                          </Button>
                        )}
                        {invoice.status === "ISSUED" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Cancelar"
                            disabled={busy}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleCancel(invoice)}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Exportar PDF"
                          onClick={() => exportToPDF(buildExport(invoice))}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};
