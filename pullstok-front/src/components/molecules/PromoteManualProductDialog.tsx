import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryTreePicker } from "@/components/molecules/CategoryTreePicker";
import { usePromoteManualProduct } from "@/components/hooks/usePromoteManualProduct";
import { MANUAL_CATEGORY_NAME, type ManualProduct } from "@/services/productService";

// Constante estable: el picker no debe refetchear las categorías en cada render.
const EXCLUDED_ROOTS = [MANUAL_CATEGORY_NAME];

interface PromoteManualProductDialogProps {
  /** Producto a promover; `null` mantiene el diálogo cerrado. */
  product: ManualProduct | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Diálogo "Agregar al sistema": el admin elige la categoría real destino (árbol
 * de categorías, sin "Carga manual") y el producto pasa a real. Si la API falla
 * muestra el message del server por toast y el diálogo sigue abierto.
 */
export const PromoteManualProductDialog = ({
  product,
  onOpenChange,
}: PromoteManualProductDialogProps) => {
  const { promote, promoting } = usePromoteManualProduct();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Guard síncrono contra doble envío (doble click antes del re-render).
  const submittingRef = useRef(false);

  // Al cambiar de producto (o cerrar) se descarta la categoría elegida antes.
  const [lastProductId, setLastProductId] = useState<string | null>(null);
  const productId = product?.id ?? null;
  if (productId !== lastProductId) {
    setLastProductId(productId);
    setCategoryId(null);
  }

  const handleConfirm = async () => {
    if (!product || !categoryId || submittingRef.current) return;
    submittingRef.current = true;
    try {
      await promote({ id: product.id, categoryId });
      toast.success(`"${product.name}" se agregó al sistema`);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error)?.message || "No se pudo agregar el producto al sistema");
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Dialog
      open={!!product}
      onOpenChange={(next) => (next || !promoting) && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar al sistema</DialogTitle>
          <DialogDescription>
            Elegí la categoría donde va a quedar el producto. Después le podés
            cargar el stock desde el catálogo.
          </DialogDescription>
        </DialogHeader>

        {product && (
          <div className="space-y-3">
            <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
              {product.name}
            </p>
            <CategoryTreePicker
              value={categoryId}
              onChange={setCategoryId}
              excludeRootNames={EXCLUDED_ROOTS}
            />
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={promoting}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!categoryId || promoting}>
            <PackagePlus className="mr-2 h-4 w-4" />
            {promoting ? "Agregando..." : "Agregar al sistema"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
