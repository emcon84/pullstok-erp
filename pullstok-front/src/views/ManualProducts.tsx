import { memo, useCallback, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader } from "@/components/atoms/loader";
import { PromoteManualProductDialog } from "@/components/molecules/PromoteManualProductDialog";
import { useManualProducts } from "@/components/hooks/useManualProducts";
import { roleAllows } from "@/constants/rolePermissions";
import { getMe } from "@/services/onboardingService";
import type { ManualProduct } from "@/services/productService";

const formatPrice = (price: number | string) =>
  `$${Number(price).toLocaleString("es-AR")}`;

interface ManualProductRowProps {
  product: ManualProduct;
  onPromote: (product: ManualProduct) => void;
}

// Memoizada: al abrir/cerrar el diálogo no se re-renderiza toda la lista.
const ManualProductRow = memo(({ product, onPromote }: ManualProductRowProps) => (
  <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <p className="truncate font-medium">{product.name}</p>
      <p className="text-sm tabular-nums text-muted-foreground">{formatPrice(product.price)}</p>
    </div>
    <Button size="sm" onClick={() => onPromote(product)} className="w-full sm:w-auto">
      <PackagePlus className="mr-2 h-4 w-4" />
      Agregar al sistema
    </Button>
  </li>
));
ManualProductRow.displayName = "ManualProductRow";

/**
 * Vista admin "Carga manual" (ADMIN/MANAGEMENT): productos que los vendedores
 * cargaron a mano desde el POS y siguen pendientes de revisión. Cada uno se
 * pasa a producto real con "Agregar al sistema" (elige la categoría destino).
 */
export const ManualProducts = () => {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { products, loading, error, refetch } = useManualProducts();
  const [selected, setSelected] = useState<ManualProduct | null>(null);

  const handlePromote = useCallback((product: ManualProduct) => setSelected(product), []);
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) setSelected(null);
  }, []);

  // Guard client-side (el server también restringe GET /products/manual): un
  // rol sin acceso que pinte la URL vuelve al dashboard.
  if (me && !roleAllows(me.role, "/carga-manual")) {
    return <Navigate to="/dashboard" replace />;
  }

  const count = products.length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
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
        <Card>
          <ul className="divide-y">
            {products.map((product) => (
              <ManualProductRow key={product.id} product={product} onPromote={handlePromote} />
            ))}
          </ul>
        </Card>
      )}

      <PromoteManualProductDialog product={selected} onOpenChange={handleOpenChange} />
    </div>
  );
};
