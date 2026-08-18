import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import {
  searchProducts,
  type ProductSearchHit,
} from "../services/priceLists";

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

/** Buscador de productos del catálogo para una línea de la factura. */
const ProductLineSearch = ({
  value,
  onChange,
  onPick,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (hit: ProductSearchHit) => void;
  disabled?: boolean;
}) => {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProductSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  // El dropdown se renderiza en un PORTAL a document.body con position fixed
  // para que no lo recorte el overflow-x-auto del contenedor de la tabla.
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const runSearch = async () => {
    const query = term.trim();
    if (!query) return;
    setSearching(true);
    try {
      const hits = await searchProducts(query);
      setResults(hits);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const pick = (hit: ProductSearchHit) => {
    onPick(hit);
    setOpen(false);
    setTerm("");
  };

  // Cuando se abre, captura la posición del input para anclar el dropdown.
  useEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchorRect({ top: r.bottom, left: r.left, width: r.width });
  }, [open]);

  // Cierra el dropdown al hacer click afuera.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const dropdown =
    open && anchorRect ? (
      createPortal(
        <ul
          className="fixed z-50 mt-1 max-h-48 w-full overflow-auto rounded border bg-background shadow-md"
          style={{
            top: anchorRect.top + 4,
            left: anchorRect.left,
            width: anchorRect.width,
          }}
          data-testid="product-search-results"
        >
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-sm hover:bg-accent"
                onClick={() => pick(hit)}
              >
                <span>{hit.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(hit.price)}
                </span>
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )
    ) : null;

  const emptyState =
    open && results.length === 0 && !searching && anchorRect
      ? createPortal(
          <p
            className="fixed z-50 mt-1 rounded border bg-background px-2 py-1 text-xs text-muted-foreground shadow-md"
            style={{
              top: anchorRect.top + 4,
              left: anchorRect.left,
              width: anchorRect.width,
            }}
            data-testid="product-search-empty"
          >
            Sin resultados
          </p>,
          document.body,
        )
      : null;

  return (
    <div ref={anchorRef} className="relative">
      <div className="flex gap-1">
        <Input
          value={value}
          placeholder="Buscar producto…"
          aria-label="Buscar producto"
          disabled={disabled}
          onChange={(e) => {
            setTerm(e.target.value);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={runSearch}
          disabled={searching || disabled}
        >
          Buscar
        </Button>
      </div>
      {dropdown}
      {emptyState}
    </div>
  );
};

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
    setCustomerId(invoice.customerId ?? "");
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
                  <ProductLineSearch
                    value={item.description}
                    onChange={(value) =>
                      handleItemChange(index, "description", value)
                    }
                    onPick={(hit) =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === index
                            ? { ...it, description: hit.name, unitPrice: hit.price }
                            : it,
                        ),
                      )
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
                    title="Precio del sistema, editable"
                    data-testid={`unit-price-${index}`}
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
