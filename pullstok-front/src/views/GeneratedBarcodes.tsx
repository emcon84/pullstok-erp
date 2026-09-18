import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getBarcodesReport,
  generateProductBarcode,
  type BarcodeReportItem,
  type BarcodesReport,
} from "@/services/productService";
import { exportBarcodeLabels } from "@/utils/exportBarcodeLabels";

/**
 * Vista de códigos de barra generados: mirror de SavedPlanillas (misma page
 * shell) con la búsqueda/tabla de SecoBarcodesReportDialog generalizada a
 * página completa. Genera códigos INT##### para productos sin barcode y
 * permite seleccionarlos + imprimirlos en PDF (exportBarcodeLabels).
 */
export const GeneratedBarcodes = () => {
  const [report, setReport] = useState<BarcodesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBarcodesReport();
      setReport(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar el reporte");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    if (!report) return [];
    const q = filter.trim().toLowerCase();
    const base = q
      ? report.items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q),
        )
      : report.items;
    return [...base].sort((a, b) => {
      if (a.hasBarcode !== b.hasBarcode) {
        return a.hasBarcode ? 1 : -1;
      }
      return a.name.localeCompare(b.name, "es");
    });
  }, [report, filter]);

  const handleGenerate = async (item: BarcodeReportItem) => {
    setGeneratingId(item.id);
    try {
      const result = await generateProductBarcode(item.id);
      setReport((prev) =>
        prev
          ? {
              ...prev,
              conBarcode: prev.conBarcode + 1,
              sinBarcode: prev.sinBarcode - 1,
              items: prev.items.map((i) =>
                i.id === item.id
                  ? { ...i, barcode: result.barcode, hasBarcode: true }
                  : i,
              ),
            }
          : prev,
      );
      toast.success("Código de barra generado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar el código");
    } finally {
      setGeneratingId(null);
    }
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handlePrint = () => {
    const selected = filteredItems.filter(
      (i) => i.hasBarcode && selectedIds.has(i.id),
    );
    if (selected.length === 0) return;
    exportBarcodeLabels(selected.map((i) => ({ name: i.name, barcode: i.barcode })));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Códigos de barra</h1>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Catálogo</CardTitle>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" />
              Imprimir seleccionados
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando…
            </p>
          ) : !report || report.total === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay productos en el catálogo.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Total: {report.total}</Badge>
                <Badge>Con código: {report.conBarcode}</Badge>
                <Badge variant="destructive">Sin código: {report.sinBarcode}</Badge>
              </div>

              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nombre o categoría…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>

              <div className="max-h-[60vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Código de barra</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Sin resultados
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell>{item.barcode || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={item.hasBarcode ? "default" : "destructive"}>
                              {item.hasBarcode ? "Con código" : "Sin código"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {item.hasBarcode ? (
                              <Checkbox
                                aria-label={`Seleccionar ${item.name} para imprimir`}
                                checked={selectedIds.has(item.id)}
                                onCheckedChange={(checked) =>
                                  toggleSelected(item.id, checked === true)
                                }
                              />
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={generatingId === item.id}
                                onClick={() => handleGenerate(item)}
                              >
                                {generatingId === item.id ? "Generando…" : "Generar código"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
