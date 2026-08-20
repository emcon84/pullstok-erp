import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPriceLists,
  type PriceListSummary,
  type PriceListLayout,
} from "@/services/priceLists";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

/** Badge del tipo de planilla (SECO/WET). */
const typeBadge = (type: PriceListLayout) => (
  <Badge variant={type === "SECO" ? "default" : "secondary"}>{type}</Badge>
);

/**
 * Listado de planillas mayoristas guardadas (sdd/alican-wholesale-price-list):
 * permite reimprimir/consultar una planilla ya importada sin volver a subir el
 * PDF. Cada fila enlaza al detalle (/planilla-mayorista/:id) y hay un botón
 * para ir al wizard de importación (/planilla-mayorista/importar).
 */
export const PriceListList = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<PriceListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPriceLists();
      setItems(data.items ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al listar las planillas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Planilla mayorista</h1>
          <p className="text-muted-foreground">
            Planillas de precios guardadas. Hacé clic en una fila para ver su
            detalle e imprimirla.
          </p>
        </div>
        <Button onClick={() => navigate("/planilla-mayorista/importar")}>
          Importar nueva planilla
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Planillas guardadas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando planillas…
            </p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay planillas guardadas. Importá una nueva planilla para
              empezar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Archivo fuente</TableHead>
                  <TableHead>Importada</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((pl) => (
                  <TableRow key={pl.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link
                        to={`/planilla-mayorista/${pl.id}`}
                        className="block"
                        aria-label={`Ver detalle de planilla ${pl.sourceFilename}`}
                      >
                        {typeBadge(pl.type)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/planilla-mayorista/${pl.id}`}
                        className="block font-medium"
                      >
                        {pl.provider}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to={`/planilla-mayorista/${pl.id}`} className="block">
                        {pl.period ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to={`/planilla-mayorista/${pl.id}`} className="block">
                        {pl.sourceFilename}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to={`/planilla-mayorista/${pl.id}`} className="block">
                        {formatDate(pl.importedAt)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to={`/planilla-mayorista/${pl.id}`} className="block tabular-nums">
                        {pl.entriesCount}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
