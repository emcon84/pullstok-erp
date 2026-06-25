import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ArrowLeft, Pencil, FileCheck2, CircleDollarSign, Ban, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  useCancelInvoice,
  useGetInvoiceById,
  useIssueInvoice,
  useMarkInvoiceAsPaid,
} from "../components/hooks/useInvoices";
import { InvoiceStatus, PaymentStatus } from "../models/invoiceModel";
import { exportToPDF } from "../utils/exportToPDF";
import { getMe } from "../services/onboardingService";

/**
 * Módulo Facturación de Servicios (sdd/facturacion-servicios, WS4+WS5).
 * Vista detalle read-only de una Invoice: datos fiscales básicos, líneas,
 * totales y botones de transición de estado (Emitir/Cobrar/Cancelar) según
 * el status actual.
 *
 * PDF "comprobante no fiscal" (WS5): usa la firma extendida de
 * exportToPDF.ts (InvoicePdfData) pasando datos fiscales de emisor y
 * cliente. El emisor (Organization: name/taxId/taxCondition) se lee con
 * useQuery(["me"]) — MISMO queryKey que ProtectedLayout.tsx ya usa para
 * gatear toda la app, así que reutiliza el cache de TanStack Query sin
 * disparar un fetch nuevo a /auth/me en la navegación normal (no se agregó
 * ninguna llamada nueva a auth, solo se lee el cache ya poblado). El
 * cliente (Customer.taxId/taxCondition/address) viene en `invoice.customer`
 * y la organización (Organization.taxId/taxCondition/address) en
 * `me.organization`; ambos tipos ya declaran estos campos fiscales
 * (customerModel.ts, onboardingService.ts), sin necesidad de casts locales.
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

export const InvoiceDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { invoice, loadingInvoice, errorInvoice } = useGetInvoiceById(id);
  const { issueInvoice, loadingIssue } = useIssueInvoice();
  const { markAsPaid, loadingMarkAsPaid } = useMarkInvoiceAsPaid();
  const { cancelInvoice, loadingCancel } = useCancelInvoice();
  const [actionPending, setActionPending] = useState(false);
  // Cache compartido con ProtectedLayout.tsx (mismo queryKey ["me"]) — no
  // dispara request nueva, solo lee los datos de organización ya cargados.
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  if (loadingInvoice) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (errorInvoice || !invoice) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar la factura: {errorInvoice?.message || "no encontrada"}
      </div>
    );
  }

  const handleIssue = () => {
    if (!window.confirm("¿Emitir esta factura? No podrá editarse después.")) return;
    setActionPending(true);
    issueInvoice(invoice.id, {
      onSuccess: () => toast.success("Factura emitida con éxito"),
      onError: (error) => toast.error(error.message),
      onSettled: () => setActionPending(false),
    });
  };

  const handleMarkAsPaid = () => {
    setActionPending(true);
    markAsPaid(invoice.id, {
      onSuccess: () => toast.success("Factura marcada como cobrada"),
      onError: (error) => toast.error(error.message),
      onSettled: () => setActionPending(false),
    });
  };

  const handleCancel = () => {
    if (!window.confirm("¿Cancelar esta factura? Esta acción no se puede revertir.")) return;
    setActionPending(true);
    cancelInvoice(invoice.id, {
      onSuccess: () => toast.success("Factura cancelada"),
      onError: (error) => toast.error(error.message),
      onSettled: () => setActionPending(false),
    });
  };

  const handleExportPDF = () => {
    const customer = invoice.customer;
    const organization = me?.organization;

    exportToPDF({
      title: "Factura",
      documentNumber: invoice.number || "Borrador",
      date: formatDate(invoice.issueDate),
      customer: invoice.customer?.name,
      issuer: {
        name: organization?.name,
        taxId: organization?.taxId ?? undefined,
        taxCondition: organization?.taxCondition ?? undefined,
        address: organization?.address ?? undefined,
      },
      customerTaxId: customer?.taxId ?? undefined,
      customerTaxCondition: customer?.taxCondition ?? undefined,
      customerAddress: customer?.address ?? undefined,
      items: invoice.items.map((item) => ({
        quantity: item.quantity,
        name: item.description,
        price: item.unitPrice,
        taxRate: item.taxRate,
        total: item.lineTotal ?? item.quantity * item.unitPrice,
      })),
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      total: invoice.totalAmount,
    });
  };

  const busy = actionPending || loadingIssue || loadingMarkAsPaid || loadingCancel;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate("/facturacion")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Factura {invoice.number || "(borrador)"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Cliente: {invoice.customer?.name || "-"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {invoice.status === "DRAFT" && (
            <>
              <Button
                variant="outline"
                onClick={() => navigate(`/facturacion/${invoice.id}/editar`)}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              <Button disabled={busy} onClick={handleIssue}>
                <FileCheck2 className="h-4 w-4" />
                Emitir
              </Button>
            </>
          )}
          {invoice.status === "ISSUED" && invoice.paymentStatus !== "PAID" && (
            <Button disabled={busy} onClick={handleMarkAsPaid}>
              <CircleDollarSign className="h-4 w-4" />
              Marcar cobrada
            </Button>
          )}
          {invoice.status === "ISSUED" && (
            <Button
              variant="outline"
              disabled={busy}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleCancel}
            >
              <Ban className="h-4 w-4" />
              Cancelar
            </Button>
          )}
          <Button variant="outline" onClick={handleExportPDF}>
            <FileText className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Estado</p>
          <Badge variant={STATUS_VARIANT[invoice.status]} className="mt-1">
            {STATUS_LABEL[invoice.status]}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Cobro</p>
          {invoice.status === "CANCELLED" ? (
            <p className="mt-1 text-sm">-</p>
          ) : (
            <Badge variant={PAYMENT_VARIANT[invoice.paymentStatus]} className="mt-1">
              {PAYMENT_LABEL[invoice.paymentStatus]}
            </Badge>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Fecha de emisión</p>
          <p className="mt-1 text-sm">{formatDate(invoice.issueDate)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Vencimiento</p>
          <p className="mt-1 text-sm">{formatDate(invoice.dueDate)}</p>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-medium">Conceptos</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Precio unit.</TableHead>
              <TableHead>IVA %</TableHead>
              <TableHead className="text-right">Subtotal línea</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.items.map((item, index) => (
              <TableRow key={item.id || index}>
                <TableCell>{item.description}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                <TableCell>{item.taxRate}%</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.lineTotal ?? item.quantity * item.unitPrice)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Separator className="my-4" />

        <div className="flex flex-col items-end gap-1 text-sm">
          <div className="flex w-48 justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex w-48 justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span>{formatCurrency(invoice.taxAmount)}</span>
          </div>
          <div className="flex w-48 justify-between font-semibold">
            <span>Total</span>
            <span>{formatCurrency(invoice.totalAmount)}</span>
          </div>
        </div>

        {invoice.notes && (
          <>
            <Separator className="my-4" />
            <div>
              <p className="text-xs text-muted-foreground">Notas</p>
              <p className="mt-1 text-sm">{invoice.notes}</p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};
