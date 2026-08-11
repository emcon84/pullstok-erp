import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DataItem } from "@/types";

interface PrintProductListProps {
  products: DataItem[];
  branchMode?: boolean;
}

export const PrintProductList = ({
  products,
  branchMode,
}: PrintProductListProps) => {
  // Same helpers as ProductsTable so the printed list matches what the
  // dashboard shows for stock and prices.
  const branchQty = (p: DataItem) =>
    branchMode
      ? Number(p.stocks?.[0]?.quantity ?? 0)
      : Number(p.stocks?.[0]?.quantity ?? p.quantity);

  // Same criterion as isLooseEligible (backend) and QuantityModal: if the
  // product is sold by weight (priceKgSuelto > 0), stock is shown in kg.
  const stockUnitLabel = (p: DataItem) =>
    Number(p.priceKgSuelto ?? 0) > 0 ? "kg" : "u.";

  const sorted = [...products].sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), "es", {
      sensitivity: "base",
    }),
  );

  return (
    <div className="print-area hidden print:block" aria-hidden="true">
      <div className="mb-4">
        <h1 className="text-lg font-bold">Listado de productos</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("es-AR")} · {products.length} productos
        </p>
        {branchMode && (
          <p className="text-xs text-muted-foreground">Stock por sucursal</p>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead className="text-center">Stock</TableHead>
            <TableHead className="text-right">Precio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-32 text-center text-muted-foreground"
              >
                No hay productos todavía.
              </TableCell>
            </TableRow>
          )}
          {sorted.map((p) => {
            const id = p._id || p.id;
            return (
              <TableRow key={id}>
                <TableCell>
                  <p className="font-medium leading-tight">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono leading-none mt-0.5">
                    {p.code || "—"}
                  </p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {(p.category as unknown as { name?: string })?.name ||
                    p.category ||
                    "—"}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {branchQty(p)} {stockUnitLabel(p)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  $ {Number(p.price ?? 0).toLocaleString("es-AR")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
