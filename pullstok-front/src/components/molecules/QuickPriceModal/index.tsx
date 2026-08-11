import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign } from "lucide-react";
import { toast } from "react-toastify";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProduct } from "../../../services/productService";
import { DataItem } from "../../../types";

interface QuickPriceModalProps {
  open: boolean;
  onClose: () => void;
  product: DataItem | null;
}

export const QuickPriceModal = ({ open, onClose, product }: QuickPriceModalProps) => {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState("");
  const [priceKgSuelto, setPriceKgSuelto] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && product) {
      setPrice(String(Number(product.price ?? 0)));
      // Per-kg prefill: show the current value when present; empty when
      // absent/0 (empty = back to automatic computation on save).
      const currentKg = product.priceKgSuelto;
      setPriceKgSuelto(
        currentKg != null && Number(currentKg) > 0 ? String(Number(currentKg)) : "",
      );
    }
  }, [open, product]);

  const handleSave = async () => {
    if (!product) return;
    const id = product._id || product.id;
    const value = Number(price);
    if (!id || Number.isNaN(value) || value < 0) {
      toast.error("Ingresá un precio válido");
      return;
    }
    let kgValue: number | null = null;
    if (priceKgSuelto.trim() !== "") {
      kgValue = Number(priceKgSuelto);
      if (Number.isNaN(kgValue) || kgValue < 0) {
        toast.error("Ingresá un precio por kg válido");
        return;
      }
    }
    setSaving(true);
    try {
      await updateProduct({
        _id: id,
        price: value,
        priceKgSuelto: kgValue,
      } as unknown as DataItem);
      queryClient.invalidateQueries();
      queryClient.invalidateQueries({ queryKey: ["product-facets"] });
      toast.success("Precio actualizado");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar el precio",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeDollarSign className="h-5 w-5 text-primary" />
            Actualizar precio
          </DialogTitle>
          <DialogDescription className="break-words">
            {product?.name || "Producto"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="quick-price">Precio</Label>
          <Input
            id="quick-price"
            aria-label="Precio"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-price-kg">Precio por kg</Label>
          <Input
            id="quick-price-kg"
            aria-label="Precio por kg"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="Automático"
            value={priceKgSuelto}
            onChange={(e) => setPriceKgSuelto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Vacío = automático (calculado del precio/peso). Con valor = precio
            por kg fijado a mano y gana sobre el cálculo automático.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
