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
}

export const PrintProductList = ({ products }: PrintProductListProps) => {
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
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Precio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={2}
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
                <TableCell className="font-medium leading-tight">
                  {p.name}
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
