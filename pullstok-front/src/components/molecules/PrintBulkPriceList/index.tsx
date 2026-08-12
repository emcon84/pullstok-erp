import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BulkPricePreviewRow } from "@/services/productService";
import { groupByBrand } from "@/lib/printGrouping";

interface PrintBulkPriceListProps {
  rows: BulkPricePreviewRow[];
}

const brandOf = (row: BulkPricePreviewRow) =>
  row.brandValues?.join(", ") ?? "";

const sortByName = (a: BulkPricePreviewRow, b: BulkPricePreviewRow) =>
  String(a.name ?? "").localeCompare(String(b.name ?? ""), "es", {
    sensitivity: "base",
  });

/**
 * Listado imprimible de la actualización masiva: SOLO nombre del producto y
 * precio actualizado (newPrice). Mismo patrón print-area que PrintProductList
 * (visible únicamente en @media print, ver index.css). Cuando el lote abarca
 * varias marcas, se divide por títulos por marca.
 */
export const PrintBulkPriceList = ({ rows }: PrintBulkPriceListProps) => {
  const groups = groupByBrand(rows, brandOf, sortByName);

  return (
    <div className="print-area hidden print:block" aria-hidden="true">
      <div className="mb-4">
        <h1 className="text-lg font-bold">Listado de precios actualizados</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("es-AR")} · {rows.length} productos
        </p>
      </div>

      {groups.length === 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Precio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={2}
                className="h-32 text-center text-muted-foreground"
              >
                No hay productos.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}

      {groups.map((group) => (
        <div key={group.brand} className="mb-6 break-inside-avoid">
          <h2 className="mb-2 border-b pb-1 text-base font-bold uppercase">
            {group.brand}
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((row) => (
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
      ))}
    </div>
  );
};
