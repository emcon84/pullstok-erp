import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  listSavedPlanillas,
  getSavedPlanilla,
  deleteSavedPlanilla,
  type SavedPlanilla,
  type SavedPlanillaSummary,
} from "@/services/savedPlanillas";
import { exportSavedPlanillaPdf } from "@/utils/exportSavedPlanillaPdf";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const typeLabel = (type: string) =>
  type === "MAYORISTA" ? "Planilla mayorista" : "Actualización de precios";

/**
 * Planillas guardadas (saved planillas): listado de las planillas persistidas
 * por el usuario, con "Abrir" (carga el snapshot completo y muestra un
 * preview) y "Imprimir PDF" (genera el PDF real con exportSavedPlanillaPdf).
 * Permite reabrir/imprimir desde otro dispositivo.
 */
export const SavedPlanillas = () => {
  const [items, setItems] = useState<SavedPlanillaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SavedPlanilla | null>(null);
  const [openLoading, setOpenLoading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSavedPlanillas();
      setItems(data.items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al listar las planillas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpen = async (id: string) => {
    setOpenLoading(id);
    try {
      setSelected(await getSavedPlanilla(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al abrir la planilla");
    } finally {
      setOpenLoading(null);
    }
  };

  const handlePrint = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const name = await exportSavedPlanillaPdf(selected);
      if (name) toast.success("PDF descargado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar el PDF");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedPlanilla(id);
      toast.success("Planilla eliminada");
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al borrar la planilla");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Planillas guardadas</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Guardadas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando planillas…
            </p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay planillas guardadas. Guardá una desde la planilla mayorista
              o desde la actualización de precios.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Filas</TableHead>
                  <TableHead>Guardada</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>
                      <Badge variant={item.type === "MAYORISTA" ? "default" : "outline"}>
                        {typeLabel(item.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.rowsCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={openLoading === item.id}
                          onClick={() => handleOpen(item.id)}
                        >
                          {openLoading === item.id ? "Abriendo…" : "Abrir"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{selected.title}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={handlePrint}
              >
                Imprimir PDF
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {typeLabel(selected.type)} · {formatDate(selected.createdAt)} ·{" "}
              {selected.rows.length} filas
            </p>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría/Talla</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    {selected.type === "MAYORISTA" && (
                      <TableHead className="text-right">Sugerido</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.rows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="uppercase">
                        {row.tipo ?? "-"}
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {`$${Number(row.prices[0] ?? 0).toLocaleString("es-AR")}`}
                      </TableCell>
                      {selected.type === "MAYORISTA" && (
                        <TableCell className="text-right tabular-nums">
                          {`$${Number(row.prices[1] ?? 0).toLocaleString("es-AR")}`}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
