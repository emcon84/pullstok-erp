import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { imgSrc } from "@/components/hooks/vendorCatalogHelpers";
import type { DataItem } from "@/types";

interface ScannedProductDialogProps {
  product: DataItem | null;
  open: boolean;
  onClose: () => void;
  onEdit: (product: DataItem) => void;
}

/**
 * Modal de producto escaneado con la pistola (perfil admin). Muestra los datos
 * principales y ofrece "Editar", que el padre resuelve abriendo el ProductDrawer.
 */
export const ScannedProductDialog = ({
  product,
  open,
  onClose,
  onEdit,
}: ScannedProductDialogProps) => {
  const image = product?.image ? imgSrc(product.image) : null;
  const rawStock = product?.stocks?.[0]?.quantity ?? product?.quantity;
  const stock = rawStock == null || rawStock === "" ? null : Number(rawStock);

  return (
    <Dialog open={open && !!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{product?.name}</DialogTitle>
          <DialogDescription>Producto escaneado</DialogDescription>
        </DialogHeader>

        {image && (
          <div className="flex justify-center">
            <img
              src={image}
              alt={product?.name}
              className="h-32 w-32 rounded-lg object-cover"
            />
          </div>
        )}

        {product && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {product.code && (
              <p>
                Código: <span className="font-medium text-foreground">{product.code}</span>
              </p>
            )}
            {product.barcode && (
              <p>
                Código de barras:{" "}
                <span className="font-medium text-foreground">{product.barcode}</span>
              </p>
            )}
            {stock !== null && !Number.isNaN(stock) && (
              <p>
                Stock: <span className="font-medium text-foreground">{stock}</span>
              </p>
            )}
          </div>
        )}

        <div className="rounded-lg bg-muted p-3 text-right text-2xl font-bold tabular-nums">
          ${Math.round(Number(product?.price ?? 0)).toLocaleString("es-AR")}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button autoFocus onClick={() => product && onEdit(product)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
