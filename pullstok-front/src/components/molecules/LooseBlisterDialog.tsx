import { useState } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
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
import { BlisterLooseFields } from "@/components/molecules/BlisterLooseFields";
import {
  computePerUnitPrice,
  effectivePrice,
  isValidPiecesPerBlister,
} from "@/components/hooks/vendorCatalogHelpers";
import type { DataItem } from "@/types";

export interface LooseBlisterResult {
  loose: boolean;
  quantity: number;
  /** Solo presente cuando loose = true. */
  piecesPerBlister?: number;
}

interface LooseBlisterDialogProps {
  product: DataItem;
  initialQty: number;
  sellsWholesale: boolean;
  /** Tope de cantidad cuando se vende el blister entero (stock vendible). */
  maxWholeQty: number;
  onConfirm: (result: LooseBlisterResult) => void;
  onCancel: () => void;
}

/** Tope de pastillas por línea (el stock suelto lo valida el server). */
const MAX_LOOSE_QTY = 9999;

/**
 * Diálogo del buscador del catálogo para productos FARMACIA: antes de sumar la
 * fila al pedido permite elegir "Vender pastillas sueltas" (mismo contrato que
 * el modal de escaneo de UnifiedPos). Con el switch apagado confirma el blister
 * entero como siempre. Se monta solo mientras hay un producto pendiente.
 */
export const LooseBlisterDialog = ({
  product,
  initialQty,
  sellsWholesale,
  maxWholeQty,
  onConfirm,
  onCancel,
}: LooseBlisterDialogProps) => {
  const [loose, setLoose] = useState(false);
  const [pieces, setPieces] = useState(0);
  const [qty, setQty] = useState(Math.max(1, initialQty));

  const maxQty = loose ? MAX_LOOSE_QTY : Math.max(1, maxWholeQty);
  const piecesValid = isValidPiecesPerBlister(pieces);
  const canConfirm = qty > 0 && (!loose || piecesValid);

  const catalogPrice = effectivePrice(product, sellsWholesale);
  // Preview (UX only — el server recomputa el precio real al cobrar).
  const unitPrice = loose
    ? computePerUnitPrice(catalogPrice, pieces || null) ?? 0
    : catalogPrice;

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm(
      loose
        ? { loose: true, quantity: qty, piecesPerBlister: pieces }
        : { loose: false, quantity: qty },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>
            Elegí si vendés el blister entero o pastillas sueltas
          </DialogDescription>
        </DialogHeader>

        <BlisterLooseFields
          checked={loose}
          onCheckedChange={setLoose}
          pieces={pieces}
          onPiecesChange={setPieces}
        />

        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Disminuir"
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Label htmlFor="loose-blister-qty-input" className="sr-only">
              Cantidad
            </Label>
            <Input
              id="loose-blister-qty-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={qty || ""}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                setQty(digits === "" ? 0 : Math.min(parseInt(digits, 10), maxQty));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
              }}
              className="h-9 w-14 shrink-0 text-center tabular-nums"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Aumentar"
              disabled={qty >= maxQty}
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-2xl font-bold tabular-nums">
            ${Math.round(unitPrice * qty).toLocaleString("es-AR")}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button autoFocus onClick={confirm} disabled={!canConfirm}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            Agregar al pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
