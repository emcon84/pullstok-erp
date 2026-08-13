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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listPriceKgTypes,
  createPriceKgType,
  updatePriceKgType,
  deletePriceKgType,
  parseSynonyms,
  type PriceKgType,
} from "@/services/priceKgTypes";
import {
  listPriceKgBrands,
  createPriceKgBrand,
  updatePriceKgBrand,
  deletePriceKgBrand,
  parseKeywords,
  type PriceKgBrand,
} from "@/services/priceKgBrands";
import {
  bulkKgPriceUpdate,
  listPriceKgProducts,
  type BulkKgPricePreview,
  type BulkKgPricePayload,
  type PriceKgListItem,
} from "@/services/productService";

const formatPrice = (n: number) =>
  `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Precios por kilo (sdd/price-kg): gestión de tipos (etapas de vida) + gestión
 * de marcas (líneas/sabores editables con keywords) + propagación de precio por
 * kilo sobre productos (marca + tipo + precio) + impresión de la planilla.
 */
export const PriceKgUpdate = () => {
  // --- Gestión de tipos ---
  const [types, setTypes] = useState<PriceKgType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typeName, setTypeName] = useState("");
  const [typeSynonyms, setTypeSynonyms] = useState("");
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [savingType, setSavingType] = useState(false);
  const [deleteTypeId, setDeleteTypeId] = useState<string | null>(null);

  // --- Gestión de marcas ---
  const [brands, setBrands] = useState<PriceKgBrand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [brandName, setBrandName] = useState("");
  const [brandKeywords, setBrandKeywords] = useState("");
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [deleteBrandId, setDeleteBrandId] = useState<string | null>(null);

  // --- Propagación por kilo ---
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [entries, setEntries] = useState<{ typeId: string; priceKg: string }[]>([
    { typeId: "", priceKg: "" },
  ]);
  const [preview, setPreview] = useState<BulkKgPricePreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // --- Impresión de la planilla ---
  const [printRows, setPrintRows] = useState<PriceKgListItem[] | null>(null);

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

  const loadBrands = useCallback(async () => {
    try {
      const data = await listPriceKgBrands();
      setBrands(data);
    } catch {
      setBrands([]);
    } finally {
      setLoadingBrands(false);
    }
  }, []);

  useEffect(() => {
    loadTypes();
    loadBrands();
  }, [loadTypes, loadBrands]);

  // --- Tipos: handlers ---
  const startEditType = (t: PriceKgType) => {
    setEditingTypeId(t.id);
    setTypeName(t.name);
    setTypeSynonyms(t.synonyms.join(", "));
  };

  const resetTypeForm = () => {
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
      resetTypeForm();
      await loadTypes();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al guardar el tipo";
      toast.error(message);
    }
    setSavingType(false);
  };

  const handleDeleteType = async () => {
    if (!deleteTypeId) return;
    setSavingType(true);
    try {
      await deletePriceKgType(deleteTypeId);
      toast.success("Tipo eliminado");
      setDeleteTypeId(null);
      await loadTypes();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al eliminar el tipo";
      toast.error(message);
    }
    setSavingType(false);
  };

  // --- Marcas: handlers ---
  const startEditBrand = (b: PriceKgBrand) => {
    setEditingBrandId(b.id);
    setBrandName(b.name);
    setBrandKeywords(b.keywords.join(", "));
  };

  const resetBrandForm = () => {
    setEditingBrandId(null);
    setBrandName("");
    setBrandKeywords("");
  };

  const handleSaveBrand = async () => {
    const name = brandName.trim();
    if (!name) return;
    setSavingBrand(true);
    try {
      const keywords = parseKeywords(brandKeywords);
      if (editingBrandId) {
        await updatePriceKgBrand(editingBrandId, { name, keywords });
        toast.success("Marca actualizada");
      } else {
        await createPriceKgBrand({ name, keywords });
        toast.success("Marca creada");
      }
      resetBrandForm();
      await loadBrands();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al guardar la marca";
      toast.error(message);
    }
    setSavingBrand(false);
  };

  const handleDeleteBrand = async () => {
    if (!deleteBrandId) return;
    setSavingBrand(true);
    try {
      await deletePriceKgBrand(deleteBrandId);
      toast.success("Marca eliminada");
      setDeleteBrandId(null);
      await loadBrands();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al eliminar la marca";
      toast.error(message);
    }
    setSavingBrand(false);
  };

  // --- Propagación: handlers ---
  const updateEntry = (
    index: number,
    patch: Partial<{ typeId: string; priceKg: string }>,
  ) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
    setPreview(null);
  };

  const addEntry = () => {
    setEntries((prev) => [...prev, { typeId: "", priceKg: "" }]);
    setPreview(null);
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length === 0 ? [{ typeId: "", priceKg: "" }] : next;
    });
    setPreview(null);
  };

  const validEntries = entries
    .map((e) => ({ typeId: e.typeId, priceKg: parseFloat(e.priceKg) }))
    .filter((e) => e.typeId !== "" && !Number.isNaN(e.priceKg) && e.priceKg > 0);

  // Una fila está "incompleta" si le falta tipo o precio, o si el precio no es
  // válido (> 0). Frena el preview para no mandar un payload a medias.
  const hasIncompleteRows = entries.some((e) => {
    const typeSet = e.typeId !== "";
    const price = parseFloat(e.priceKg);
    const priceSet = e.priceKg.trim() !== "" && !Number.isNaN(price);
    if (typeSet && priceSet) return price <= 0;
    return typeSet || priceSet;
  });

  const previewEnabled =
    selectedBrandId !== "" && validEntries.length > 0 && !hasIncompleteRows;

  const buildPayload = (): BulkKgPricePayload | null => {
    if (!previewEnabled) return null;
    return { brandId: selectedBrandId, entries: validEntries };
  };

  const handlePreview = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting(true);
    try {
      const data = await bulkKgPriceUpdate(payload, true);
      setPreview(data as BulkKgPricePreview);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al obtener preview";
      toast.error(message);
    }
    setSubmitting(false);
  };

  const handleApply = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting(true);
    try {
      const result = await bulkKgPriceUpdate(payload, false);
      toast.success(`${result.affected} productos actualizados`);
      setPreview(null);
      setEntries([{ typeId: "", priceKg: "" }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al aplicar";
      toast.error(message);
    }
    setSubmitting(false);
  };

  const applyDisabled = !preview || preview.affected === 0 || submitting;

  // --- Impresión ---
  const handlePrint = async () => {
    setSubmitting(true);
    try {
      const items = await listPriceKgProducts();
      setPrintRows(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al preparar impresión";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Una vez montado el área print (printRows no nulo), abrir el diálogo de
  // impresión y limpiar el estado al cerrarlo (afterprint).
  useEffect(() => {
    if (!printRows) return;
    window.print();
    const cleanup = () => setPrintRows(null);
    window.addEventListener("afterprint", cleanup);
    return () => window.removeEventListener("afterprint", cleanup);
  }, [printRows]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Precios por kilo</h1>
        <Button variant="outline" size="sm" disabled={submitting} onClick={handlePrint}>
          Imprimir planilla
        </Button>
      </div>

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
                      onClick={() => startEditType(t)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTypeId(t.id)}
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
              <Button variant="outline" onClick={resetTypeForm}>
                Cancelar
              </Button>
            )}
          </div>

          <AlertDialog
            open={deleteTypeId !== null}
            onOpenChange={(open) => {
              if (!open) setDeleteTypeId(null);
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

      {/* Sección B — Gestión de marcas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Marcas (líneas / sabores)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingBrands ? (
            <p className="text-sm text-muted-foreground">Cargando marcas...</p>
          ) : brands.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay marcas todavía. Creá la primera con el formulario de abajo.
            </p>
          ) : (
            <ul className="space-y-2">
              {brands.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{b.name}</span>
                    {b.keywords.map((k) => (
                      <Badge key={k} variant="outline">
                        {k}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditBrand(b)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteBrandId(b.id)}
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
              <Label htmlFor="brand-name">Nombre</Label>
              <Input
                id="brand-name"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Ej: MAXXIUM CORDERO"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-keywords">
                Palabras clave (separadas por coma)
              </Label>
              <Input
                id="brand-keywords"
                value={brandKeywords}
                onChange={(e) => setBrandKeywords(e.target.value)}
                placeholder="Ej: MAXXIUM, CORDERO"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              disabled={!brandName.trim() || savingBrand}
              onClick={handleSaveBrand}
            >
              {editingBrandId ? "Guardar cambios" : "Agregar marca"}
            </Button>
            {editingBrandId && (
              <Button variant="outline" onClick={resetBrandForm}>
                Cancelar
              </Button>
            )}
          </div>

          <AlertDialog
            open={deleteBrandId !== null}
            onOpenChange={(open) => {
              if (!open) setDeleteBrandId(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar marca</AlertDialogTitle>
                <AlertDialogDescription>
                  ¿Seguro que querés eliminar esta marca? Esta acción no se puede
                  deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteBrand}>
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Sección C — Propagar precio por kilo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Propagar precio por kilo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kg-brand">Marca</Label>
            {loadingBrands ? (
              <p className="text-sm text-muted-foreground">Cargando marcas...</p>
            ) : brands.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay marcas. Creá una en la sección de arriba.
              </p>
            ) : (
              <Select
                value={selectedBrandId}
                onValueChange={(value) => {
                  setSelectedBrandId(value);
                  setPreview(null);
                }}
              >
                <SelectTrigger id="kg-brand" className="w-full">
                  <SelectValue placeholder="Seleccionar marca" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-3">
            {entries.map((entry, index) => (
              <div
                key={index}
                className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`kg-entry-type-${index}`}>Tipo</Label>
                  <Select
                    value={entry.typeId}
                    onValueChange={(value) => updateEntry(index, { typeId: value })}
                  >
                    <SelectTrigger id={`kg-entry-type-${index}`} className="w-full">
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`kg-entry-price-${index}`}>Precio por kilo</Label>
                  <Input
                    id={`kg-entry-price-${index}`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej: 2500"
                    value={entry.priceKg}
                    onChange={(e) => updateEntry(index, { priceKg: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="sm:mb-0.5"
                  aria-label="Quitar tipo"
                  onClick={() => removeEntry(index)}
                >
                  X
                </Button>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" onClick={addEntry}>
              Agregar otro tipo
            </Button>
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
                      <TableHead>Tipo</TableHead>
                      <TableHead>Precio/kg actual</TableHead>
                      <TableHead className="text-right">Precio/kg nuevo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.typeName}</TableCell>
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
                    {preview.affected} productos se actualizarán al precio por
                    kilo de su tipo. El conteo final puede diferir si el
                    catálogo cambió desde la vista previa.
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

      {/* Print area: only visible when printing (see @media print in index.css) */}
      {printRows && (
        <div className="print-area hidden print:block" aria-hidden="true">
          <div className="mb-4">
            <h1 className="text-lg font-bold">Planilla de precios por kilo</h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString("es-AR")} · {printRows.length} productos
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Precio por kilo actual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {printRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium leading-tight">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {row.priceKgSuelto === null
                      ? "—"
                      : formatPrice(row.priceKgSuelto)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
