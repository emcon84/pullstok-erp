import { useMemo, useState } from "react";
import { Download, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSecoBarcodesReport } from "../../hooks/useSecoBarcodesReport";
import type { SecoBarcodeItem } from "../../../services/productService";

interface SecoBarcodesReportDialogProps {
  open: boolean;
  onClose: () => void;
}

// Escapa un valor para CSV separado por `;`: los valores con `;`, `"` o salto
// de línea van entre comillas y las comillas internas se duplican (RFC 4180).
const csvEscape = (value: string): string => {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const toCsv = (rows: SecoBarcodeItem[]): string => {
  const header = "NOMBRE;ESPECIE;CODIGO_SKU;CODIGO_BARRA;TIENE_BARRA";
  const body = rows
    .map((r) =>
      [
        r.name,
        r.species,
        r.code,
        r.barcode,
        r.hasBarcode ? "SI" : "NO",
      ]
        .map(csvEscape)
        .join(";"),
    )
    .join("\n");
  return `${header}\n${body}`;
};

export const SecoBarcodesReportDialog = ({
  open,
  onClose,
}: SecoBarcodesReportDialogProps) => {
  const { report, loading, error } = useSecoBarcodesReport(open);
  const [filter, setFilter] = useState("");

  // Aplica el filtro de búsqueda (case-insensitive sobre name y code) y ordena
  // primero los SIN código de barras y después los con; dentro de cada grupo
  // alfabéticamente por nombre.
  const filteredItems = useMemo(() => {
    if (!report) return [];
    const q = filter.trim().toLowerCase();
    const base = q
      ? report.items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.code.toLowerCase().includes(q),
        )
      : report.items;
    return [...base].sort((a, b) => {
      if (a.hasBarcode !== b.hasBarcode) {
        return a.hasBarcode ? 1 : -1;
      }
      return a.name.localeCompare(b.name, "es");
    });
  }, [report, filter]);

  const handleDownload = () => {
    const rows = filteredItems.length > 0 ? filteredItems : report?.items ?? [];
    const csv = toCsv(rows);
    // BOM para que Excel AR abra el archivo con la codificación correcta.
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "alimento-seco-barcodes.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Alimento seco · códigos de barra</span>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted-foreground/20"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando…
          </p>
        )}

        {error && (
          <p role="alert" className="text-destructive">
            {error.message}
          </p>
        )}

        {report && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Total: {report.total}</Badge>
              <Badge>Con código: {report.conBarcode}</Badge>
              <Badge variant="destructive">Sin código: {report.sinBarcode}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nombre o código…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4" />
                Descargar CSV
              </Button>
            </div>

            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Especie</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Código de barra</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground"
                      >
                        Sin resultados
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.species}</TableCell>
                        <TableCell>{item.code || "—"}</TableCell>
                        <TableCell>{item.barcode || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={item.hasBarcode ? "default" : "outline"}>
                            {item.hasBarcode ? "SI" : "NO"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
