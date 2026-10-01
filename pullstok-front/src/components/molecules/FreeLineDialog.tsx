import { useEffect, useState } from "react";
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
import { parseManualPrice } from "@/components/hooks/vendorRowHelpers";
import type { FreeLineInput } from "@/components/hooks/useVendorCart";

interface FreeLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Línea ya validada (nombre, gramos enteros > 0, total > 0): el llamador la suma al pedido. */
  onSubmit: (line: FreeLineInput) => void;
  /** Se llama tras cerrarse (devuelve el foco al listado; ver ManualProductDialog). */
  onClosed?: () => void;
}

const NAME_MAX = 120;

/**
 * Diálogo "Venta libre" del POS: nombre + gramos + PRECIO TOTAL. Vende algo
 * ad-hoc (ej. hueso molido por gramos) sin crear ningún producto: la línea va
 * solo al pedido y a la venta, no a ningún catálogo ni a /carga-manual.
 */
export const FreeLineDialog = ({ open, onOpenChange, onSubmit, onClosed }: FreeLineDialogProps) => {
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("");
  const [total, setTotal] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Al cerrarse se limpian los campos para la próxima carga.
  useEffect(() => {
    if (!open) {
      setName("");
      setGrams("");
      setTotal("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const g = parseInt(grams, 10);
    const t = parseManualPrice(total);
    if (!cleanName) return setError("Ingresá el nombre del producto");
    if (!Number.isInteger(g) || g < 1) return setError("Ingresá los gramos (mayor a 0)");
    if (!Number.isFinite(t) || t <= 0) return setError("Ingresá un precio total mayor a 0");

    setError(null);
    onSubmit({ name: cleanName, grams: g, total: Math.round(t * 100) / 100 });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onCloseAutoFocus={(e) => {
          if (!onClosed) return;
          e.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader>
          <DialogTitle>Venta libre</DialogTitle>
          <DialogDescription>
            Vendé algo por gramos sin cargarlo como producto. Solo queda en esta venta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="free-line-name">Nombre</Label>
            <Input
              id="free-line-name"
              type="text"
              autoComplete="off"
              maxLength={NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="w-28 space-y-1.5">
              <Label htmlFor="free-line-grams">Gramos</Label>
              <Input
                id="free-line-grams"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                maxLength={6}
                placeholder="0"
                value={grams}
                onChange={(e) => setGrams(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center tabular-nums"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="free-line-total">Precio total</Label>
              <Input
                id="free-line-total"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={total}
                onChange={(e) => setTotal(e.target.value.replace(/[^\d.,]/g, ""))}
                className="tabular-nums"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Agregar al pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
