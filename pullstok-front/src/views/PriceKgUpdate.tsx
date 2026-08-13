import { useState, useEffect, useCallback, useRef } from "react";
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
  listPriceKgBrands,
  createPriceKgBrand,
  updatePriceKgBrand,
  deletePriceKgBrand,
  parseKeywords,
  type PriceKgBrand,
} from "@/services/priceKgBrands";
import {
  getPriceKgPlan,
  savePriceKgPlan,
  type PriceKgPlanEntry,
} from "@/services/priceKgPlan";

const formatPrice = (n: number) =>
  `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const cellKey = (brandId: string, typeId: string) => `${brandId}:${typeId}`;

/**
 * Precios por kilo (sdd/price-kg-plan): gestión de tipos (etapas de vida) +
 * gestión de marcas (líneas/sabores editables) + editor de planilla. La
 * planilla es una matriz marca (filas) × tipo (columnas) → precio por kilo,
 * persistente e imprimible. NO se tocan productos ni se matchean nombres.
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

  // --- Planilla (matriz marca × tipo → precio) ---
  const [cells, setCells] = useState<Record<string, string>>({});
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Snapshot del estado cargado de la DB: permite detectar borrados (celda con
  // valor previo que el usuario deja vacía) y si hubo cambios antes de guardar.
  const baselineRef = useRef<Record<string, string>>({});

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

  const loadPlan = useCallback(async () => {
    try {
      const data = await getPriceKgPlan();
      const map: Record<string, string> = {};
      for (const c of data) {
        map[cellKey(c.brandId, c.typeId)] = String(c.priceKg);
      }
      setCells(map);
      baselineRef.current = { ...map };
    } catch {
      setCells({});
      baselineRef.current = {};
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  useEffect(() => {
    loadTypes();
    loadBrands();
    loadPlan();
  }, [loadTypes, loadBrands, loadPlan]);

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
      await loadPlan();
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
      await loadPlan();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al eliminar la marca";
      toast.error(message);
    }
    setSavingBrand(false);
  };

  // --- Planilla: handlers ---
  const setCell = (brandId: string, typeId: string, value: string) => {
    setCells((prev) => {
      const key = cellKey(brandId, typeId);
      const next = { ...prev };
      if (value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  };

  // Arma las entries a guardar: celdas NO vacías con precio > 0 → number;
  // celdas que quedaron vacías pero tenían valor previo → null (borrar).
  const buildEntries = (
    map: Record<string, string>,
    baseline: Record<string, string>,
  ): PriceKgPlanEntry[] => {
    const entries: PriceKgPlanEntry[] = [];
    for (const brand of brands) {
      for (const type of types) {
        const key = cellKey(brand.id, type.id);
        const raw = (map[key] ?? "").trim();
        if (raw === "") {
          if (baseline[key] !== undefined) {
            entries.push({ brandId: brand.id, typeId: type.id, priceKg: null });
          }
        } else {
          const price = parseFloat(raw);
          if (!Number.isNaN(price) && price > 0) {
            entries.push({ brandId: brand.id, typeId: type.id, priceKg: price });
          }
        }
      }
    }
    return entries;
  };

  const handleSavePlan = async () => {
    const current = buildEntries(cells, baselineRef.current);
    const baseline = buildEntries(baselineRef.current, baselineRef.current);
    if (JSON.stringify(current) === JSON.stringify(baseline)) {
      toast.info("No hay cambios para guardar");
      return;
    }
    setSavingPlan(true);
    try {
      await savePriceKgPlan(current);
      toast.success("Planilla guardada");
      await loadPlan();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al guardar la planilla";
      toast.error(message);
    }
    setSavingPlan(false);
  };

  // Celdas con precio cargado (valor no vacío y > 0), incluyendo ediciones sin
  // guardar, para el indicador.
  const loadedCount = Object.values(cells).filter((v) => {
    const p = parseFloat(v);
    return v.trim() !== "" && !Number.isNaN(p) && p > 0;
  }).length;

  const matrixReady = !loadingTypes && !loadingBrands && !loadingPlan;

  // --- Impresión ---
  const handlePrint = () => {
    setPrinting(true);
  };

  useEffect(() => {
    if (!printing) return;
    window.print();
    const cleanup = () => setPrinting(false);
    window.addEventListener("afterprint", cleanup);
    return () => window.removeEventListener("afterprint", cleanup);
  }, [printing]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Precios por kilo</h1>
        <Button
          variant="outline"
          size="sm"
          disabled={!matrixReady || brands.length === 0 || types.length === 0}
          onClick={handlePrint}
        >
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

      {/* Sección C — Planilla de precios por kilo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Planilla de precios por kilo</CardTitle>
          <p className="text-xs text-muted-foreground">
            {loadedCount} {loadedCount === 1 ? "celda" : "celdas"} con precio cargadas
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!matrixReady ? (
            <p className="text-sm text-muted-foreground">Cargando planilla...</p>
          ) : brands.length === 0 || types.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Creá al menos una marca y un tipo para completar la planilla.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Marca</TableHead>
                    {types.map((t) => (
                      <TableHead key={t.id} className="text-right">
                        {t.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {b.name}
                      </TableCell>
                      {types.map((t) => (
                        <TableCell key={t.id} className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-24 text-right"
                            aria-label={`${b.name} ${t.name}`}
                            value={cells[cellKey(b.id, t.id)] ?? ""}
                            onChange={(e) => setCell(b.id, t.id, e.target.value)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              disabled={
                savingPlan ||
                !matrixReady ||
                brands.length === 0 ||
                types.length === 0
              }
              onClick={handleSavePlan}
            >
              {savingPlan ? "Guardando..." : "Guardar planilla"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Print area: solo visible al imprimir (ver @media print en index.css) */}
      {printing && (
        <div className="print-area hidden print:block" aria-hidden="true">
          <div className="mb-4">
            <h1 className="text-lg font-bold">Planilla de precios por kilo</h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString("es-AR")} · {loadedCount} celdas
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca</TableHead>
                {types.map((t) => (
                  <TableHead key={t.id} className="text-right">
                    {t.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  {types.map((t) => {
                    const raw = (cells[cellKey(b.id, t.id)] ?? "").trim();
                    const price = parseFloat(raw);
                    const valid = raw !== "" && !Number.isNaN(price) && price > 0;
                    return (
                      <TableCell key={t.id} className="text-right tabular-nums">
                        {valid ? formatPrice(price) : "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
