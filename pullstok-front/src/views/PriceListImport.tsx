import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  applyPriceList,
  importPriceList,
  searchProducts,
  type ApplyPriceListPayload,
  type PriceListPreview,
  type PreviewRow,
  type ProductSearchHit,
} from "@/services/priceLists";

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB (mismo límite que el server)

const formatPrice = (n: number | null) =>
  n === null
    ? "—"
    : `$${n.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

/** Badge de estado de una fila del preview. */
const stateBadge = (estado: PreviewRow["estado"]) => {
  switch (estado) {
    case "matched":
      return <Badge variant="default">Matcheado</Badge>;
    case "unmatched":
      return <Badge variant="outline">Sin matchear</Badge>;
    case "multi-match":
      return <Badge variant="secondary">Múltiples matches</Badge>;
    case "duplicado":
      return <Badge variant="secondary">Duplicado</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
  }
};

interface Decision {
  accion: "import" | "omit";
  productId?: string;
}

/** Selector manual de producto (busca en el catálogo de la org). */
const ProductAssign = ({
  row,
  assigned,
  onAssign,
}: {
  row: PreviewRow;
  assigned?: string;
  onAssign: (position: number, productId: string, matchName: string) => void;
}) => {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProductSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  const runSearch = async () => {
    if (!term.trim()) return;
    setSearching(true);
    try {
      const hits = await searchProducts(term);
      setResults(hits);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const pick = (hit: ProductSearchHit) => {
    onAssign(row.position, hit.id, hit.name);
    setOpen(false);
    setTerm("");
  };

  return (
    <div className="relative">
      <div className="flex gap-1">
        <Input
          value={term}
          placeholder="Buscar producto…"
          aria-label={`Buscar producto para ${row.nombre}`}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={runSearch} disabled={searching}>
          Buscar
        </Button>
      </div>
      {assigned && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid={`asignado-${row.position}`}>
          Producto asignado
        </p>
      )}
      {open && results.length > 0 && (
        <ul
          className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border bg-background shadow-md"
          data-testid={`resultados-${row.position}`}
        >
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="block w-full px-2 py-1 text-left text-sm hover:bg-accent"
                onClick={() => pick(hit)}
              >
                {hit.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Wizard de importación de planillas de precios Alican
 * (sdd/alican-wholesale-price-list): 1) subir PDF (check client-side ≤10MB) →
 * 2) preview con badges de estados + decisión por fila (toggle import/omit +
 * asignación manual para sin matchear / múltiples matches / error) → 3)
 * resumen → 4) Importar (POST apply) → navega al detalle.
 */
export const PriceListImport = () => {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<PriceListPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (selected: File | null) => {
    setError(null);
    setPreview(null);
    setDecisions({});
    if (!selected) return;
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("El archivo tiene que ser un PDF");
      return;
    }
    if (selected.size > MAX_PDF_SIZE) {
      setError("El archivo excede 10MB");
      return;
    }
    setLoading(true);
    try {
      const result = await importPriceList(selected, true);
      setPreview(result);
      const defaults: Record<number, Decision> = {};
      for (const row of result.rows) {
        defaults[row.position] = {
          accion:
            row.estado === "matched" || row.estado === "multi-match"
              ? "import"
              : "omit",
          productId: row.productId ?? undefined,
        };
      }
      setDecisions(defaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar la planilla");
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (position: number) => {
    setDecisions((prev) => ({
      ...prev,
      [position]: {
        ...prev[position],
        accion: prev[position]?.accion === "import" ? "omit" : "import",
      },
    }));
  };

  const assignProduct = (position: number, productId: string) => {
    setDecisions((prev) => ({
      ...prev,
      [position]: { accion: "import", productId },
    }));
  };

  const counts = useMemo(() => {
    const rows = preview?.rows ?? [];
    return {
      importados: rows.filter(
        (r) => decisions[r.position]?.accion === "import",
      ).length,
      omitidos: rows.filter(
        (r) => decisions[r.position]?.accion === "omit",
      ).length,
      errores: rows.filter((r) => r.estado === "error").length,
    };
  }, [preview, decisions]);

  const importar = async () => {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: ApplyPriceListPayload = {
        layout: preview.layout,
        period: preview.period,
        sourceFilename: preview.sourceFilename,
        rows: preview.rows.map((row) => ({
          position: row.position,
          accion: decisions[row.position]?.accion ?? "omit",
          productId:
            decisions[row.position]?.productId ?? row.productId ?? undefined,
          nombre: row.nombre,
          marca: row.marca,
          linea: row.linea,
          sublinea: row.sublinea,
          unidadEmpaque: row.unidadEmpaque,
          precioSinIva: row.precioSinIva,
          precioConIva: row.precioConIva,
        })),
      };
      const result = await applyPriceList(payload);
      toast.success(
        `Planilla importada: ${result.imported} productos, ${result.omitted} omitidos`,
      );
      navigate(`/planilla-mayorista/${result.priceListId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aplicar la planilla");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Planilla mayorista</h1>
        <p className="text-muted-foreground">
          Subí la planilla de precios de Alican (PDF) para matchear productos y
          generar la lista con precios sugeridos.
        </p>
      </div>

      {/* Paso 1: subir PDF */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Subir planilla</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="planilla-pdf">Archivo PDF (máx. 10MB)</Label>
            <Input
              id="planilla-pdf"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {loading && <p className="text-sm text-muted-foreground">Procesando planilla…</p>}
          {error && (
            <p className="text-sm text-destructive" role="alert" data-testid="error">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Paso 2: preview con decisiones */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              2. Revisar matcheo · {preview.layout} ·{" "}
              {preview.period ? `vigencia ${preview.period}` : "sin vigencia"} ·{" "}
              {preview.total} filas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Importar</TableHead>
                  <TableHead>Producto (PDF)</TableHead>
                  <TableHead className="text-right">Sin IVA</TableHead>
                  <TableHead className="text-right">Con IVA</TableHead>
                  <TableHead className="text-right">Sugerido</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Asignar producto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row) => {
                  const decision = decisions[row.position] ?? { accion: "omit" };
                  return (
                    <TableRow key={row.position}>
                      <TableCell>
                        <Checkbox
                          checked={decision.accion === "import"}
                          onCheckedChange={() => toggleRow(row.position)}
                          aria-label={`Importar ${row.nombre}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium leading-tight">{row.nombre}</div>
                        {row.unidadEmpaque && (
                          <div className="text-xs text-muted-foreground">
                            {row.unidadEmpaque}
                            {row.marca ? ` · ${row.marca}` : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(row.precioSinIva)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(row.precioConIva)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(row.sugerido)}
                      </TableCell>
                      <TableCell>{stateBadge(row.estado)}</TableCell>
                      <TableCell>
                        {(row.estado === "unmatched" ||
                          row.estado === "multi-match" ||
                          row.estado === "error") && (
                          <ProductAssign
                            row={row}
                            assigned={decision.productId}
                            onAssign={assignProduct}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Paso 3: resumen + importar */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Resumen e importar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <strong>{counts.importados}</strong> a importar ·{" "}
              <strong>{counts.omitidos}</strong> omitidos ·{" "}
              <strong>{counts.errores}</strong> con error
            </p>
            <Button onClick={importar} disabled={submitting || counts.importados === 0}>
              {submitting ? "Importando…" : "Importar planilla"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
