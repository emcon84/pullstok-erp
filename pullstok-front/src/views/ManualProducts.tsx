import { memo, useCallback, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { PackagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader } from "@/components/atoms/loader";
import { PromoteManualProductDialog } from "@/components/molecules/PromoteManualProductDialog";
import { useManualProducts } from "@/components/hooks/useManualProducts";
import { useDeleteManualProduct } from "@/components/hooks/useDeleteManualProduct";
import { useConfirm } from "@/components/hooks/useConfirm";
import { roleAllows } from "@/constants/rolePermissions";
import { getMe } from "@/services/onboardingService";
import type { ApiError, ManualProduct } from "@/services/productService";

const formatPrice = (price: number | string) =>
  `$${Number(price).toLocaleString("es-AR")}`;

interface ManualProductRowProps {
  product: ManualProduct;
  busy: boolean;
  onPromote: (product: ManualProduct) => void;
  onDelete: (product: ManualProduct) => void;
}

// Memoizada: al abrir/cerrar un diálogo no se re-renderiza toda la tabla.
const ManualProductRow = memo(({ product, busy, onPromote, onDelete }: ManualProductRowProps) => (
  <TableRow>
    <TableCell className="max-w-[16rem] whitespace-normal font-medium">
      <span className="line-clamp-2 break-words">{product.name}</span>
    </TableCell>
    <TableCell className="tabular-nums">{formatPrice(product.price)}</TableCell>
    <TableCell className="text-muted-foreground">{product.category?.name ?? "—"}</TableCell>
    <TableCell>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onPromote(product)}
          disabled={busy}
          aria-label={`Agregar al sistema: ${product.name}`}
        >
          <PackagePlus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Agregar al sistema</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(product)}
          disabled={busy}
          aria-label={`Eliminar ${product.name}`}
        >
          <Trash2 className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Eliminar</span>
        </Button>
      </div>
    </TableCell>
  </TableRow>
));
ManualProductRow.displayName = "ManualProductRow";

/**
 * Vista admin "Carga manual" (ADMIN/MANAGEMENT): productos que los vendedores
 * cargaron a mano desde el POS y siguen pendientes de revisión. Cada uno se
 * pasa a producto real con "Agregar al sistema" (elige la categoría destino) o
 * se elimina (con confirmación) si quedó de prueba.
 */
export const ManualProducts = () => {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { products, loading, error, refetch } = useManualProducts();
  const { deleteProduct, deleting } = useDeleteManualProduct();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<ManualProduct | null>(null);
  // Guard síncrono contra doble envío (doble click antes del re-render).
  const deletingRef = useRef(false);

  const handlePromote = useCallback((product: ManualProduct) => setSelected(product), []);
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) setSelected(null);
  }, []);

  const handleDelete = useCallback(
    async (product: ManualProduct) => {
      if (deletingRef.current) return;
      const ok = await confirm({
        title: "¿Eliminar producto manual?",
        description: `"${product.name}" se eliminará permanentemente. Las ventas ya realizadas conservan su historial.`,
        confirmLabel: "Eliminar",
        danger: true,
      });
      if (!ok || deletingRef.current) return;
      deletingRef.current = true;
      try {
        await deleteProduct(product.id);
        toast.success(`"${product.name}" se eliminó`);
      } catch (err) {
        const apiError = err as ApiError;
        toast.error(apiError?.message || "No se pudo eliminar el producto");
        // 404: ya no existe (otro admin lo borró o lo promovió) → refrescar la lista.
        if (apiError?.status === 404) refetch();
      } finally {
        deletingRef.current = false;
      }
    },
    [confirm, deleteProduct, refetch],
  );

  // Guard client-side (el server también restringe GET /products/manual): un
  // rol sin acceso que pinte la URL vuelve al dashboard.
  if (me && !roleAllows(me.role, "/carga-manual")) {
    return <Navigate to="/dashboard" replace />;
  }

  const count = products.length;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Carga manual</h1>
        <p className="text-muted-foreground">
          Productos que los vendedores cargaron a mano desde el POS. Agregalos al
          sistema eligiendo su categoría real.
        </p>
        {!loading && !error && count > 0 && (
          <p className="mt-1 text-sm font-medium">
            {count} {count === 1 ? "pendiente" : "pendientes"}
          </p>
        )}
      </div>

      {loading ? (
        <div role="status" className="flex justify-center py-12">
          <Loader />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-destructive">{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : count === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay productos pendientes de revisión.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          {/* En pantallas angostas el primitivo Table scrollea en X dentro de su
              contenedor (sin scroll horizontal de la página). */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <ManualProductRow
                  key={product.id}
                  product={product}
                  busy={deleting}
                  onPromote={handlePromote}
                  onDelete={handleDelete}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <PromoteManualProductDialog product={selected} onOpenChange={handleOpenChange} />
    </div>
  );
};
