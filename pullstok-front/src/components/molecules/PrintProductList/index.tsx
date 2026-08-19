import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DataItem } from "@/types";
import { groupByBrand, productBrandOf } from "@/lib/printGrouping";
import { PrintHeader } from "@/components/molecules/PrintHeader";

interface PrintProductListProps {
  products: DataItem[];
}

const sortByName = (a: DataItem, b: DataItem) =>
  String(a.name ?? "").localeCompare(String(b.name ?? ""), "es", {
    sensitivity: "base",
  });

export const PrintProductList = ({ products }: PrintProductListProps) => {
  const groups = groupByBrand(products, productBrandOf, sortByName);

  return (
    <div className="print-area hidden print:block" aria-hidden="true">
      <PrintHeader
        title="Listado de productos"
        subtitle={`${new Date().toLocaleDateString("es-AR")} · ${products.length} productos`}
      />

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
                No hay productos todavía.
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
              {group.items.map((p) => {
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
      ))}
    </div>
  );
};
