import { memo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PriceKgSpecies } from "@/services/priceKgTypes";

export interface LooseCellRow {
  /** key de la celda (species:brandId:typeId) — identifica la fila. */
  cellKey: string;
  /** Id de la celda PriceKgPrice (loosePriceId) — identifica la línea al vender. */
  cellId: string;
  brandName: string;
  typeName: string;
  species: PriceKgSpecies;
  priceKg: number;
  /** Stock suelto en kg de la sucursal (null = sin lectura). */
  stockKg: number | null;
}

interface LooseSellTableProps {
  rows: LooseCellRow[];
  selectedIndex: number;
  registerRow: (index: number, el: HTMLTableRowElement | null) => void;
  registerInput: (index: number, el: HTMLInputElement | null) => void;
  onRowClick: (index: number, row: LooseCellRow) => void;
  qty: (index: number) => string;
  onQtyChange: (index: number, value: string) => void;
  onCommit: (index: number) => void;
}

const SPECIES_LABEL: Record<PriceKgSpecies, string> = {
  PERRO: "Perro",
  GATO: "Gato",
  AMBOS: "Perro y gato",
};

const money = (n: number) =>
  n.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

/**
 * Tabla de la planilla "Suelto" del POS vendedor: celdas marca × tipo × especie
 * con precio por kg, stock suelto de la sucursal y un input inline de kg
 * (POR_PESO) con roving focus + Enter/click para agregar al pedido.
 * Presentacional y memoizada: la lógica de filas vive en LooseSellTab.
 */
export const LooseSellTable = memo(
  ({
    rows,
    selectedIndex,
    registerRow,
    registerInput,
    onRowClick,
    qty,
    onQtyChange,
    onCommit,
  }: LooseSellTableProps) => (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader className="bg-muted/20">
          <TableRow className="hover:bg-transparent">
            <TableHead>Marca</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Especie</TableHead>
            <TableHead className="text-right">Precio/kg</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="w-[150px] text-right">Cantidad</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const isSelected = index === selectedIndex;
            const noStock = row.stockKg === null || row.stockKg <= 0;
            return (
              <TableRow
                key={row.cellKey}
                ref={(el) => registerRow(index, el)}
                className={cn(
                  "cursor-pointer hover:bg-muted/50 transition-all",
                  isSelected && "bg-primary/10 ring-2 ring-primary/60 dark:bg-primary/20",
                )}
                onClick={() => onRowClick(index, row)}
              >
                <TableCell className="font-medium">{row.brandName}</TableCell>
                <TableCell>{row.typeName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-medium">
                    {SPECIES_LABEL[row.species]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  ${money(row.priceKg)}
                  <span className="text-xs font-normal text-muted-foreground">
                    /kg
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.stockKg === null ? (
                    "—"
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium",
                        noStock
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : "border-emerald-300 bg-emerald-50 text-emerald-700",
                      )}
                    >
                      {row.stockKg.toFixed(2)} kg
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Input
                      ref={(el) => registerInput(index, el)}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={qty(index)}
                      onChange={(e) => onQtyChange(index, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          onCommit(index);
                        }
                      }}
                      disabled={noStock}
                      className="h-8 w-16 text-center"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 shrink-0"
                      disabled={noStock}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCommit(index);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  ),
);
