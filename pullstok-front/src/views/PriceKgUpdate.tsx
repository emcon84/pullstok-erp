import { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  listPriceKgTypes,
  createPriceKgType,
  updatePriceKgType,
  deletePriceKgType,
  parseSynonyms,
  type PriceKgType,
} from "@/services/priceKgTypes";
import {
  bulkKgPriceUpdate,
  type BulkKgPricePreview,
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
 * Precios por kilo (sdd/price-kg): gestión de tipos (etapas de vida) + propagación
 * de precio por kilo sobre productos (marca + tipo + precio). Versión simplificada
 * de BulkPriceUpdate (sin categorías, proveedores, % ni paginación).
 */
export const PriceKgUpdate = () => {
  // --- Gestión de tipos ---
  const [types, setTypes] = useState<PriceKgType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typeName, setTypeName] = useState("");
  const [typeSynonyms, setTypeSynonyms] = useState("");
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [savingType, setSavingType] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // --- Propagación por kilo ---
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [typeId, setTypeId] = useState("");
  const [priceKg, setPriceKg] = useState("");
  const [preview, setPreview] = useState<BulkKgPricePreview | null>(null);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const headers = () => {
    const token = localStorage.getItem("token");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  const loadTypes = useCallback(async () => {
    try {
      const data = await listPriceKgTypes();
      setTypes(data);
    } catch {
      setTypes([]);
    } finally {
      setLoadingTypes(false);
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  // Load brands (Marca variant options), dedupe + sort (same as BulkPriceUpdate).
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

  const startEdit = (t: PriceKgType) => {
    setEditingTypeId(t.id);
    setTypeName(t.name);
    setTypeSynonyms(t.synonyms.join(", "));
  };

  const resetForm = () => {
    setEditingTypeId(null);
    setTypeName("");
    setTypeSynonyms("");
  };

  const handleSaveType = async () => {
    const name = typeName.trim();
    if (!name) return;
    setSavingType(true);
    try {
      const synonyms = parseSynonyms(typeSynonyms);
      if (editingTypeId) {
        await updatePriceKgType(editingTypeId, { name, synonyms });
        toast.success("Tipo actualizado");
      } else {
        await createPriceKgType({ name, synonyms });
        toast.success("Tipo creado");
      }
      resetForm();
      await loadTypes();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al guardar el tipo";
      toast.error(message);
    }
    setSavingType(false);
  };

  const handleDeleteType = async () => {
    if (!deleteTargetId) return;
    setSavingType(true);
    try {
      await deletePriceKgType(deleteTargetId);
      toast.success("Tipo eliminado");
      setDeleteTargetId(null);
      await loadTypes();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al eliminar el tipo";
      toast.error(message);
    }
    setSavingType(false);
  };

  const toggleBrand = (value: string) => {
    setSelectedBrands((prev) =>
      prev.includes(value) ? prev.filter((b) => b !== value) : [...prev, value],
    );
    setPreview(null);
  };

  const priceKgNum = parseFloat(priceKg);
  const previewEnabled =
    selectedBrands.length > 0 &&
    typeId !== "" &&
    !Number.isNaN(priceKgNum) &&
    priceKgNum > 0;

  const payload = useCallback(
    () => ({
      brandValues: selectedBrands,
      typeId,
      priceKg: priceKgNum,
    }),
    [selectedBrands, typeId, priceKgNum],
  );

  const handlePreview = async () => {
    if (!previewEnabled) return;
    setSubmitting(true);
    try {
      const data = await bulkKgPriceUpdate(payload(), true);
      setPreview(data as BulkKgPricePreview);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al obtener preview";
      toast.error(message);
    }
    setSubmitting(false);
  };

  const handleApply = async () => {
    setSubmitting(true);
    try {
      const result = await bulkKgPriceUpdate(payload(), false);
      toast.success(`${result.affected} productos actualizados`);
      setPreview(null);
      setSelectedBrands([]);
      setPriceKg("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al aplicar";
      toast.error(message);
    }
    setSubmitting(false);
  };

  const applyDisabled =
    !preview || preview.affected === 0 || submitting;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold">Precios por kilo</h1>

      {/* Sección A — Gestión de tipos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tipos (etapas de vida)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingTypes ? (
            <p className="text-sm text-muted-foreground">Cargando tipos...</p>
          ) : types.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay tipos todavía. Creá el primero con el formulario de abajo.
            </p>
          ) : (
            <ul className="space-y-2">
              {types.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    {t.synonyms.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(t)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTargetId(t.id)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="type-name">Nombre</Label>
              <Input
                id="type-name"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                placeholder="Ej: Adulto"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type-synonyms">Sinónimos (separados por coma)</Label>
              <Input
                id="type-synonyms"
                value={typeSynonyms}
                onChange={(e) => setTypeSynonyms(e.target.value)}
                placeholder="Ej: Adulto, Adult, Maduro"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              disabled={!typeName.trim() || savingType}
              onClick={handleSaveType}
            >
              {editingTypeId ? "Guardar cambios" : "Agregar tipo"}
            </Button>
            {editingTypeId && (
              <Button variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>

          <AlertDialog
            open={deleteTargetId !== null}
            onOpenChange={(open) => {
              if (!open) setDeleteTargetId(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar tipo</AlertDialogTitle>
                <AlertDialogDescription>
                  ¿Seguro que querés eliminar este tipo? Esta acción no se puede
                  deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteType}>
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Sección B — Propagar precio por kilo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Propagar precio por kilo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Marcas</Label>
            {loadingBrands ? (
              <p className="text-sm text-muted-foreground">Cargando marcas...</p>
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
                      selectedBrands.includes(b.value) ? "default" : "outline"
                    }
                    className="cursor-pointer uppercase transition-opacity hover:opacity-80"
                    onClick={() => toggleBrand(b.value)}
                  >
                    {b.value}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="kg-type">Tipo</Label>
              <select
                id="kg-type"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={typeId}
                onChange={(e) => {
                  setTypeId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="" disabled>
                  Seleccionar tipo
                </option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kg-price">Precio por kilo</Label>
              <Input
                id="kg-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ej: 2500"
                value={priceKg}
                onChange={(e) => {
                  setPriceKg(e.target.value);
                  setPreview(null);
                }}
              />
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!previewEnabled || submitting}
            onClick={handlePreview}
          >
            {submitting ? "Calculando..." : "Calcular preview"}
          </Button>

          {preview && (
            <>
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">Afectados</p>
                <p className="text-lg font-bold">{preview.affected}</p>
              </div>

              <div className="max-h-[320px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Precio/kg actual</TableHead>
                      <TableHead className="text-right">Precio/kg nuevo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>
                          {row.currentPriceKg === null
                            ? "—"
                            : formatPrice(row.currentPriceKg)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPrice(row.newPriceKg)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

            </>
          )}

          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={applyDisabled}
              onClick={() => setDialogOpen(true)}
            >
              Aplicar
            </Button>
          </div>

          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Confirmar propagación de precio por kilo
                </AlertDialogTitle>
                {preview && (
                  <AlertDialogDescription>
                    {preview.affected} productos se actualizarán a{" "}
                    {formatPrice(priceKgNum)} por kilo. El conteo final puede
                    diferir si el catálogo cambió desde la vista previa.
                  </AlertDialogDescription>
                )}
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleApply}>
                  Aplicar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};
