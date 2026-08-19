import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DataItem } from "@/types";
import { groupByPlanTitle } from "@/lib/printGrouping";
import { PrintHeader } from "@/components/molecules/PrintHeader";

interface PrintProductListProps {
  products: DataItem[];
}

export const PrintProductList = ({ products }: PrintProductListProps) => {
  // Títulos ALICAN: los productos con planSection se agrupan por título en
  // orden del PDF; sin sección caen a su marca (productBrandOf) y los que no
  // tienen marca ni sección van al bucket final "Sin marca".
  const groups = groupByPlanTitle(products);

  return (
    <div className="print-area hidden print:block" aria-hidden="true">
      <PrintHeader
        title="Listado de productos"
        subtitle={`${new Date().toLocaleDateString("es-AR")} · ${products.length} productos`}
      />

      {products.length === 0 && (
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
        <div key={group.title} className="mb-6">
          <h2 className="mb-2 border-b pb-1 text-base font-bold uppercase">
            {group.title}
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
