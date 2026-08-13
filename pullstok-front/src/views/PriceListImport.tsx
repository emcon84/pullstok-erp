import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { listProviders, type Provider } from "@/services/providers";

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB (mismo límite que el server)

/** Valor especial del selector: escribir un proveedor nuevo (ej. "ALICAN"). */
const NEW_PROVIDER = "__new__";

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
 * Decisiones default tras el preview. Con importAll ON → toda fila con precios
 * entra como planilla-only (import sin productId salvo que esté matcheada);
 * con OFF → comportamiento anterior (solo matched/multi-match por default).
 */
const buildDefaults = (rows: PreviewRow[], importAll: boolean): Record<number, Decision> => {
  const defaults: Record<number, Decision> = {};
  for (const row of rows) {
    if (importAll) {
      const hasMatch = row.estado === "matched" || row.estado === "multi-match";
      defaults[row.position] = {
        accion: row.estado === "error" ? "omit" : "import",
        productId: hasMatch ? (row.productId ?? undefined) : undefined,
      };
    } else {
      defaults[row.position] = {
        accion:
          row.estado === "matched" || row.estado === "multi-match"
            ? "import"
            : "omit",
        productId: row.productId ?? undefined,
      };
    }
  }
  return defaults;
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
  const [importAll, setImportAll] = useState(true);
  const [applyPrices, setApplyPrices] = useState(true);
  // Proveedor de la planilla (sdd/alican-wholesale-price-list/providers):
  // nombre seleccionado de los existentes o texto para crear uno nuevo.
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerName, setProviderName] = useState("");
  const [providerCustom, setProviderCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Proveedores existentes de la org para el selector del paso 1.
  useEffect(() => {
    listProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

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
      setDecisions(buildDefaults(result.rows, importAll));
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

  const toggleImportAll = (checked: boolean | "indeterminate") => {
    const next = checked === true;
    setImportAll(next);
    if (preview) setDecisions(buildDefaults(preview.rows, next));
  };

  const toggleApplyPrices = (checked: boolean | "indeterminate") => {
    setApplyPrices(checked === true);
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

  /**
   * Plan de aplicación de precios (espejo del server, buildPriceApplyPlan):
   * cuántos productos vinculados se van a actualizar (productId + Con IVA) y
   * cuáles se van a crear (sin productId + Con IVA). Solo informativo para el
   * preview de confirmación; el apply re-deriva server-side (autoritativo).
   */
  const applyPlan = useMemo(() => {
    const rows = preview?.rows ?? [];
    let updates = 0;
    const creates: { nombre: string }[] = [];
    for (const row of rows) {
      const decision = decisions[row.position] ?? { accion: "omit" };
      if (decision.accion !== "import") continue;
      if (row.precioConIva == null) continue; // sin Con IVA no aplica ni se crea
      if (decision.productId ?? row.productId) updates++;
      else creates.push({ nombre: row.nombre });
    }
    return { updates, creates };
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
        applyPrices,
        ...(providerName.trim() ? { providerName: providerName.trim() } : {}),
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
      const detail = [
        `${result.imported} productos importados`,
        `${result.omitted} omitidos`,
      ];
      if (applyPrices) {
        detail.push(
          `${result.priceUpdated} precios actualizados`,
          `${result.productsCreated} productos creados`,
        );
      }
      toast.success(`Planilla importada: ${detail.join(" · ")}`);
      setDialogOpen(false);
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

          <div className="space-y-1">
            <Label htmlFor="proveedor">Proveedor (opcional)</Label>
            <NativeSelect
              id="proveedor"
              value={providerCustom ? NEW_PROVIDER : providerName}
              onValueChange={(v) => {
                if (v === NEW_PROVIDER) {
                  setProviderCustom(true);
                  setProviderName("");
                } else {
                  setProviderCustom(false);
                  setProviderName(v);
                }
              }}
              placeholder="Elegí un proveedor"
              options={[
                { value: "", label: "—" },
                ...providers.map((p) => ({ value: p.name, label: p.name })),
                { value: NEW_PROVIDER, label: "Crear proveedor nuevo…" },
              ]}
            />
            {providerCustom && (
              <Input
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="Ej: ALICAN"
                aria-label="Nombre del nuevo proveedor"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Los productos tocados por esta planilla (matcheados y creados)
              quedarán asociados a este proveedor.
            </p>
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
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="importar-todas"
                  checked={importAll}
                  onCheckedChange={toggleImportAll}
                  aria-label="Importar todas las filas"
                />
                <Label htmlFor="importar-todas" className="text-sm font-normal text-muted-foreground">
                  Importar todas las filas
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="aplicar-precios"
                  checked={applyPrices}
                  onCheckedChange={toggleApplyPrices}
                  aria-label="Aplicar precios al catálogo"
                />
                <Label htmlFor="aplicar-precios" className="text-sm font-normal text-muted-foreground">
                  Aplicar precios al catálogo
                </Label>
              </div>
            </div>
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
            {applyPrices && (
              <p className="text-sm">
                <strong>{applyPlan.updates}</strong> precios a actualizar ·{" "}
                <strong>{applyPlan.creates.length}</strong> productos a crear
              </p>
            )}
            <Button
              onClick={() => setDialogOpen(true)}
              disabled={submitting || counts.importados === 0}
            >
              {submitting ? "Importando…" : "Importar planilla"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Confirmación antes de tocar el catálogo: nada se aplica sin confirmar. */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importación</AlertDialogTitle>
            <AlertDialogDescription>
              <p>
                Se importan <strong>{counts.importados}</strong> filas y se
                omiten <strong>{counts.omitidos}</strong>.
              </p>
              {applyPrices && (
                <div className="mt-2 space-y-1">
                  <p>
                    Se actualizará el precio (Con IVA) de{" "}
                    <strong>{applyPlan.updates}</strong> productos.
                  </p>
                  {applyPlan.creates.length > 0 && (
                    <div>
                      <p>
                        Se crearán <strong>{applyPlan.creates.length}</strong>{" "}
                        productos nuevos:
                      </p>
                      <ul
                        className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-sm"
                        data-testid="crear-productos"
                      >
                        {applyPlan.creates.map((c) => (
                          <li key={c.nombre}>{c.nombre}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={importar} disabled={submitting}>
              {submitting ? "Importando…" : "Confirmar importación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
