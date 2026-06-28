import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader } from "../components/atoms/loader";
import { useCustomers } from "../components/hooks/useCustomer";
import {
  useCreateInvoice,
  useGetInvoiceById,
  useUpdateInvoice,
} from "../components/hooks/useInvoices";
import { InvoiceItemRequest } from "../models/invoiceModel";

/**
 * Módulo Facturación de Servicios (sdd/facturacion-servicios, WS4).
 * Alta/edición de Invoice en DRAFT con líneas dinámicas (conceptos libres,
 * sin productId). Cálculo de subtotal/IVA/total en vivo client-side —
 * mismo algoritmo que api/src/services/invoiceCalc.ts; el server siempre
 * recalcula y es la verdad final.
 */

const emptyItem: InvoiceItemRequest = {
  description: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 21,
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

const calculateTotals = (items: InvoiceItemRequest[]) => {
  let subtotal = 0;
  let taxAmount = 0;
  for (const item of items) {
    const lineTotal = item.quantity * item.unitPrice;
    subtotal += lineTotal;
    taxAmount += lineTotal * (item.taxRate / 100);
  }
  return { subtotal, taxAmount, totalAmount: subtotal + taxAmount };
};

export const InvoiceForm = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const { customers, loadingCustomer: loadingCustomers } = useCustomers();
  const { invoice, loadingInvoice } = useGetInvoiceById(id);
  const { submitInvoice, loadingCreate } = useCreateInvoice();
  const { editInvoice, loadingUpdate } = useUpdateInvoice();

  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItemRequest[]>([{ ...emptyItem }]);

  useEffect(() => {
    if (!invoice) return;
    setCustomerId(invoice.customerId);
    setDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 10) : "");
    setNotes(invoice.notes || "");
    setItems(
      invoice.items.length
        ? invoice.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
          }))
        : [{ ...emptyItem }],
    );
  }, [invoice]);

  // Edición solo permitida en DRAFT — si la factura ya fue emitida, se
  // redirige al detalle (es inmutable salvo paymentStatus, ver design #571).
  useEffect(() => {
    if (isEditing && invoice && invoice.status !== "DRAFT") {
      toast.error("Solo se pueden editar facturas en borrador");
      navigate(`/facturacion/${id}`, { replace: true });
    }
  }, [isEditing, invoice, id, navigate]);

  const handleItemChange = (
    index: number,
    field: keyof InvoiceItemRequest,
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === "description") {
          return { ...item, description: value };
        }
        return { ...item, [field]: Number(value) || 0 };
      }),
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, { ...emptyItem }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totals = calculateTotals(items);

  const handleSubmit = () => {
    if (!customerId) {
      toast.error("Debe seleccionar un cliente");
      return;
    }
    const validItems = items.filter((item) => item.description.trim());
    if (validItems.length === 0) {
      toast.error("Debe agregar al menos un concepto");
      return;
    }

    const payload = {
      customerId,
      dueDate: dueDate || undefined,
      notes: notes || undefined,
      items: validItems,
    };

    if (isEditing && id) {
      editInvoice(
        { id, data: payload },
        {
          onSuccess: () => {
            toast.success("Factura actualizada con éxito");
            navigate(`/facturacion/${id}`);
          },
          onError: (error) => toast.error(error.message),
        },
      );
      return;
    }

    submitInvoice(payload, {
      onSuccess: (created) => {
        toast.success("Factura creada con éxito");
        navigate(`/facturacion/${created.id}`);
      },
      onError: (error) => toast.error(error.message),
    });
  };

  if (isEditing && loadingInvoice) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  const saving = loadingCreate || loadingUpdate;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEditing ? "Editar factura" : "Nueva factura"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Borrador — los totales se recalculan al guardar.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="invoice-customer">Cliente</Label>
            <Select
              value={customerId}
              onValueChange={setCustomerId}
              disabled={loadingCustomers}
            >
              <SelectTrigger id="invoice-customer" className="w-full">
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {customers?.map((customer) => (
                  <SelectItem
                    key={customer.id || customer._id}
                    value={customer.id || customer._id || ""}
                  >
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoice-due-date">Vencimiento (opcional)</Label>
            <Input
              id="invoice-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice-notes">Notas (opcional)</Label>
          <Textarea
            id="invoice-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones para esta factura"
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Conceptos</h2>
          <Button variant="outline" size="sm" onClick={handleAddItem}>
            <Plus className="h-4 w-4" />
            Agregar línea
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2/5">Descripción</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Precio unit.</TableHead>
              <TableHead>IVA %</TableHead>
              <TableHead className="text-right">Subtotal línea</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Input
                    value={item.description}
                    placeholder="Descripción del servicio"
                    onChange={(e) =>
                      handleItemChange(index, "description", e.target.value)
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    className="w-20"
                    value={item.quantity}
                    onChange={(e) =>
                      handleItemChange(index, "quantity", e.target.value)
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-28"
                    value={item.unitPrice}
                    onChange={(e) =>
                      handleItemChange(index, "unitPrice", e.target.value)
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    className="w-20"
                    value={item.taxRate}
                    onChange={(e) =>
                      handleItemChange(index, "taxRate", e.target.value)
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.quantity * item.unitPrice)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={items.length === 1}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleRemoveItem(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex flex-col items-end gap-1 border-t pt-4 text-sm">
          <div className="flex w-48 justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(totals.subtotal)}</span>
          </div>
          <div className="flex w-48 justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span>{formatCurrency(totals.taxAmount)}</span>
          </div>
          <div className="flex w-48 justify-between font-semibold">
            <span>Total</span>
            <span>{formatCurrency(totals.totalAmount)}</span>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/facturacion")}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Guardando..." : "Guardar borrador"}
        </Button>
      </div>
    </div>
  );
};
