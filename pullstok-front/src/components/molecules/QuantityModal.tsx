import type { Dispatch, SetStateAction } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { imgSrc } from "@/components/hooks/vendorCatalogHelpers";
import type { DataItem } from "@/types";

interface QuantityModalProps {
  product: DataItem | null;
  qty: number;
  setQty: Dispatch<SetStateAction<number>>;
  maxStock: number;
  directSelling: boolean;
  onDirectSale: () => void;
  onAddToCart: () => void;
  onClose: () => void;
}

export const QuantityModal = ({
  product,
  qty,
  setQty,
  maxStock,
  directSelling,
  onDirectSale,
  onAddToCart,
  onClose,
}: QuantityModalProps) => (
  <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle className="text-base">
          {product?.name}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pb-20">
        {product?.image && imgSrc(product.image) && (
          <div className="flex justify-center">
            <img
              src={imgSrc(product.image)!}
              alt={product.name}
              className="h-32 w-32 object-cover rounded-lg"
            />
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Stock disponible:{" "}
          <span className="font-medium text-foreground">
            {maxStock} u.
          </span>
        </p>
        <p className="text-lg font-bold">
          ${product ? Number(product.price).toLocaleString("es-AR") : 0}
        </p>

        {/* Qty selector */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            disabled={qty <= 1}
            onClick={() => setQty((q) => q - 1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xl font-bold tabular-nums">
            {qty}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            disabled={qty >= maxStock}
            onClick={() => setQty((q) => q + 1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            className="w-full"
            size="lg"
            onClick={onDirectSale}
            disabled={directSelling || maxStock <= 0}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {directSelling
              ? "Procesando venta..."
              : `Vender directo ($${((product ? Number(product.price ?? 0) : 0) * qty).toLocaleString("es-AR")})`}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            size="lg"
            onClick={onAddToCart}
            disabled={directSelling}
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar al pedido
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
