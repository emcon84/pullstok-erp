import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateManualProduct } from "@/components/hooks/useCreateManualProduct";
import { parseManualPrice } from "@/components/hooks/vendorRowHelpers";
import type { DataItem } from "@/types";

interface ManualProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Producto ya creado en el server + cantidad tipeada: el llamador lo suma al pedido. */
  onCreated: (product: DataItem, quantity: number) => void;
  /** Se llama tras cerrarse (devuelve el foco al listado; ver PrintTicketDialog). */
  onClosed?: () => void;
}

/**
 * Diálogo "Producto manual" del POS: nombre + precio + cantidad. Crea el
 * producto en el server (POST /products/manual) y recién ahí avisa al llamador;
 * si la API falla muestra un toast y no avisa (nada se agrega al pedido).
 */
export const ManualProductDialog = ({
  open,
  onOpenChange,
  onCreated,
  onClosed,
}: ManualProductDialogProps) => {
  const { createManualProduct, creating } = useCreateManualProduct();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);
  // Guard síncrono contra doble envío (Enter + click antes del re-render).
  const submittingRef = useRef(false);

  // Al cerrarse se limpian los campos para la próxima carga.
  useEffect(() => {
    if (!open) {
      setName("");
      setPrice("");
      setQty("1");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const cleanName = name.trim();
    const numericPrice = parseManualPrice(price);
    const quantity = parseInt(qty, 10);
    if (!cleanName) return setError("Ingresá el nombre del producto");
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return setError("Ingresá un precio mayor a 0");
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return setError("La cantidad debe ser al menos 1");
    }

    setError(null);
    submittingRef.current = true;
    try {
      const product = await createManualProduct({ name: cleanName, price: numericPrice });
      onCreated(product, quantity);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error)?.message || "No se pudo crear el producto manual");
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next || !creating) && onOpenChange(next)}>
      <DialogContent
        className="sm:max-w-sm"
        onCloseAutoFocus={(e) => {
          if (!onClosed) return;
          e.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader>
          <DialogTitle>Producto manual</DialogTitle>
          <DialogDescription>
            Cargalo a mano si no lo encontrás. Se suma al pedido y queda pendiente
            de revisión.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="manual-product-name">Nombre</Label>
            <Input
              id="manual-product-name"
              type="text"
              autoComplete="off"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="manual-product-price">Precio</Label>
              <Input
                id="manual-product-price"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))}
                className="tabular-nums"
              />
            </div>
            <div className="w-24 space-y-1.5">
              <Label htmlFor="manual-product-qty">Cantidad</Label>
              <Input
                id="manual-product-qty"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                maxLength={4}
                value={qty}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="text-center tabular-nums"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creating}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              {creating ? "Agregando..." : "Agregar al pedido"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
