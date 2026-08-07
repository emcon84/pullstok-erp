import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DocItem {
  quantity?: number;
  name?: string;
  price?: number;
}

interface DocTableProps {
  items: DocItem[];
  /** Muestra la columna "P. unit." (pedidos/presupuestos). El carrito de la
   * venta no la muestra. */
  showUnitPrice?: boolean;
  /** Cuando se pasa, agrega un botón borrar por fila (carrito de la venta). */
  onRemove?: (index: number) => void;
}

const money = (n: number) => `$${Number(n || 0).toLocaleString("es-AR")}`;

/**
 * Tabla de ítems de un documento, responsive:
 * - Desktop (sm+): tabla clásica Cant. | Producto | [P. unit.] | Total.
 * - Mobile: cada ítem se apila — producto arriba, cantidad/precio/total abajo —
 *   evitando el corte de montos y el scroll horizontal en pantallas angostas.
 * Cada celda mobile muestra su etiqueta en el MISMO nodo de texto que el valor
 * (ej. "Cant.: 2"), para accesibilidad y tests estables.
 */
export const DocTable = ({ items, showUnitPrice, onRemove }: DocTableProps) => {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="hidden bg-muted/50 text-xs uppercase text-muted-foreground sm:table-header-group">
          <tr>
            <th className="w-16 px-3 py-2 text-center font-medium">Cant.</th>
            <th className="py-2 text-left font-medium">Producto</th>
            {showUnitPrice && (
              <th className="py-2 text-right font-medium">P. unit.</th>
            )}
            <th className="px-3 py-2 text-right font-medium">Total</th>
            {onRemove && <th className="w-10" />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((it, index) => (
            <tr
              key={index}
              className="relative flex flex-col gap-1 py-2 pl-3 pr-12 sm:table-row sm:gap-0 sm:p-0"
            >
              {/* Nombre — solo en mobile, arriba del bloque */}
              <td className="font-medium sm:hidden">{it.name ?? "—"}</td>

              <td className="tabular-nums text-muted-foreground sm:table-cell sm:w-16 sm:px-3 sm:py-2 sm:text-center sm:text-foreground">
                <span className="sm:hidden">Cant.: {it.quantity ?? 1}</span>
                <span className="hidden sm:inline">{it.quantity ?? 1}</span>
              </td>

              {/* Producto — solo en desktop */}
              <td className="hidden sm:table-cell sm:py-2">{it.name ?? "—"}</td>

              {showUnitPrice && (
                <td className="tabular-nums text-muted-foreground sm:table-cell sm:py-2 sm:text-right sm:text-foreground">
                  <span className="sm:hidden">
                    P. unit.: {money(it.price ?? 0)}
                  </span>
                  <span className="hidden sm:inline">
                    {money(it.price ?? 0)}
                  </span>
                </td>
              )}

              <td className="tabular-nums text-muted-foreground sm:table-cell sm:px-3 sm:py-2 sm:text-right sm:text-foreground">
                <span className="sm:hidden">
                  Total: {money((it.quantity ?? 1) * (it.price ?? 0))}
                </span>
                <span className="hidden sm:inline">
                  {money((it.quantity ?? 1) * (it.price ?? 0))}
                </span>
              </td>

              {onRemove && (
                <td className="absolute right-2 top-1/2 -translate-y-1/2 sm:static sm:table-cell sm:translate-y-0 sm:px-2 sm:text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onRemove(index)}
                    aria-label={`Quitar ${it.name ?? "producto"}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};