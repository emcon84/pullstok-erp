import { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CategoryTreePickerMulti } from "@/components/molecules/CategoryTreePickerMulti";
import {
  bulkPriceUpdate,
  BulkPricePreview,
  BulkPriceUpdatePayload,
} from "@/services/productService";
import { API_URL } from "@/constants";

interface BrandOption {
  id: string;
  value: string;
}

const formatPrice = (n: number) =>
  `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Actualización masiva de precios (sdd/bulk-price-update-selectors).
 * Selector de alcance: marcas (chips) + árbol de categorías multi-select
 * (subtree expansion server-side) + % con signo (−100..500). Preview paginado
 * con exclusiones por producto (todas tildadas por defecto → destildar
 * excluye). El apply re-resuelve el set en el server ($transaction) y es
 * autoritativo; el contador puede diferir del preview si algo cambió en el
 * medio — se muestra en el diálogo de confirmación.
 */
export const BulkPriceUpdate = () => {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [percentage, setPercentage] = useState("");
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<BulkPricePreview | null>(null);
  const [page, setPage] = useState(1);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  const headers = () => {
    const token = localStorage.getItem("token");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  // Load brands (Marca variant options)
  useEffect(() => {
    fetch(`${API_URL}/categories/variant-options?def=Marca`, {
      headers: headers(),
    })
      .then((res) => res.json())
      .then((data: BrandOption[]) => {
        const seen = new Set<string>();
        const unique = data.filter((b) => {
          if (seen.has(b.value)) return false;
          seen.add(b.value);
          return true;
        });
        setBrands(unique.sort((a, b) => a.value.localeCompare(b.value)));
      })
      .catch(() => setBrands([]))
      .finally(() => setLoadingBrands(false));
  }, []);

  // Cualquier cambio de alcance invalida el preview y las exclusiones previas.
  const scopeChanged = () => {
    setPreview(null);
    setExcludedIds(new Set());
    setPage(1);
  };

  const toggleBrand = (value: string) => {
    setSelectedBrands((prev) =>
      prev.includes(value) ? prev.filter((b) => b !== value) : [...prev, value],
    );
    scopeChanged();
  };

  const payload = useCallback((): BulkPriceUpdatePayload | null => {
    const pct = parseFloat(percentage);
    if (selectedBrands.length === 0 || Number.isNaN(pct)) return null;
    return {
      brandValues: selectedBrands,
      categoryIds,
      excludeProductIds: [...excludedIds],
      percentage: pct,
      categoryPercentages: [],
      productPercentages: [],
    };
  }, [selectedBrands, categoryIds, excludedIds, percentage]);

  const handlePreview = async (targetPage = 1) => {
    const p = payload();
    if (!p) return;
    setSubmitting(true);
    try {
      const data = await bulkPriceUpdate(p, true, targetPage);
      setPreview(data as BulkPricePreview);
      setPage(targetPage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al obtener preview";
      toast.error(message);
    }
    setSubmitting(false);
  };

  const toggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    const p = payload();
    if (!p) return;
    setSubmitting(true);
    try {
      const result = await bulkPriceUpdate(p, false);
      toast.success(`${result.affected} productos actualizados`);
      navigate("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al aplicar";
      toast.error(message);
    }
    setSubmitting(false);
  };

  const pct = parseFloat(percentage);
  const isNegative = !Number.isNaN(pct) && pct < 0;
  const hasMore = preview
    ? page * preview.pageSize < preview.total
    : false;
  const applyDisabled =
    !preview ||
    preview.affected === 0 ||
    excludedIds.size >= preview.affected ||
    submitting;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold">Actualización masiva de precios</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Columna izquierda: alcance */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Marcas</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBrands ? (
                <p className="text-sm text-muted-foreground">
                  Cargando marcas...
                </p>
              ) : brands.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No se encontraron marcas.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => (
                    <Badge
                      key={b.id}
                      variant={
                        selectedBrands.includes(b.value)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer transition-opacity hover:opacity-80"
                      onClick={() => toggleBrand(b.value)}
                    >
                      {b.value}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Categorías y porcentaje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Categorías (opcional — tildar un padre incluye todo su subtree)</Label>
                <CategoryTreePickerMulti
                  selected={categoryIds}
                  onChange={(ids) => {
                    setCategoryIds(ids);
                    scopeChanged();
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pct">Porcentaje (%)</Label>
                <Input
                  id="pct"
                  type="number"
                  step="0.5"
                  min="-100"
                  max="500"
                  placeholder="Ej: 15 o -10"
                  value={percentage}
                  onChange={(e) => {
                    setPercentage(e.target.value);
                    scopeChanged();
                  }}
                />
                {isNegative && (
                  <p
                    className="text-sm font-medium text-red-600"
                    role="alert"
                  >
                    Disminución: los precios se reducirán un {percentage}%
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={
                  selectedBrands.length === 0 || !percentage || submitting
                }
                onClick={() => handlePreview(1)}
              >
                {submitting ? "Calculando..." : "Calcular preview"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: preview + apply */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vista previa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Afectados</p>
                    <p className="text-lg font-bold">{preview.affected}</p>
                  </div>
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Total actual</p>
                    <p className="font-medium">
                      {formatPrice(preview.previousTotal)}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Total nuevo</p>
                    <p className="font-bold text-emerald-600">
                      {formatPrice(preview.newTotal)}
                    </p>
                  </div>
                </div>

                <div className="max-h-[320px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Marcas</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Checkbox
                              aria-label={`Excluir ${row.name}`}
                              checked={!excludedIds.has(row.id)}
                              onCheckedChange={() => toggleExclude(row.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.categoryName ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.brandValues.join(", ")}
                          </TableCell>
                          <TableCell>
                            {formatPrice(row.oldPrice)} →{" "}
                            <span className="font-medium">
                              {formatPrice(row.newPrice)}
                            </span>
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              row.delta < 0 ? "text-red-600" : ""
                            }`}
                          >
                            {row.delta >= 0 ? "+" : ""}
                            {formatPrice(row.delta)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || submitting}
                    onClick={() => handlePreview(page - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {page} · {preview.total} productos
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasMore || submitting}
                    onClick={() => handlePreview(page + 1)}
                  >
                    Siguiente
                  </Button>
                </div>

                <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={applyDisabled}
                    onClick={() => setDialogOpen(true)}
                  >
                    Aplicar cambios
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Confirmar actualización de precios
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {preview.affected} productos · {formatPrice(preview.previousTotal)} →{" "}
                        {formatPrice(preview.newTotal)}. El conteo final puede
                        diferir si el catálogo cambió desde la vista previa.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleApply}>
                        Aplicar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Seleccioná marcas y porcentaje para calcular la vista previa.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => navigate("/dashboard")}
      >
        Cancelar
      </Button>
    </div>
  );
};
