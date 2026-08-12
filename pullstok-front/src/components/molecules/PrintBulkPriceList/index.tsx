import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BulkPricePreviewRow } from "@/services/productService";

interface PrintBulkPriceListProps {
  rows: BulkPricePreviewRow[];
}

/**
 * Listado imprimible de la actualización masiva: SOLO nombre del producto y
 * precio actualizado (newPrice). Mismo patrón print-area que PrintProductList
 * (visible únicamente en @media print, ver index.css).
 */
export const PrintBulkPriceList = ({ rows }: PrintBulkPriceListProps) => {
  const sorted = [...rows].sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), "es", {
      sensitivity: "base",
    }),
  );

  return (
    <div className="print-area hidden print:block" aria-hidden="true">
      <div className="mb-4">
        <h1 className="text-lg font-bold">Listado de precios actualizados</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("es-AR")} · {rows.length} productos
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
                No hay productos.
              </TableCell>
            </TableRow>
          )}
          {sorted.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium leading-tight">
                {row.name}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                $ {Number(row.newPrice ?? 0).toLocaleString("es-AR")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
