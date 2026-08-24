import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { PackageOpen, Save, Scale, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, type NativeSelectOption } from "@/components/ui/native-select";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader } from "@/components/atoms/loader";
import { useBranches } from "@/components/hooks/useBranches";
import {
  listLooseStocks,
  setLooseStock,
  openBag,
  type LooseStockLine,
} from "@/services/looseStock";
import { products } from "@/services/productService";
import { getPriceKgPlan } from "@/services/priceKgPlan";
import { listPriceKgTypes } from "@/services/priceKgTypes";
import { listPriceKgBrands } from "@/services/priceKgBrands";
import type { ProductsProps } from "@/models/productsModel";

const SPECIES_LABELS: Record<string, string> = {
  PERRO: "Perro",
  GATO: "Gato",
  AMBOS: "Perros y gatos",
};

const formatKg = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Stock suelto (sdd/loose-lines-stock): vista admin del alimento vendido por
 * kilo desde la planilla. La línea suelta ES la celda PriceKgPrice; la fila de
 * LooseStock guarda los kg por (celda, sucursal). Acá el ADMIN/MANAGEMENT
 * ajusta los kg de cada línea (PUT /loose-stock/:lineId) y abre bolsas
 * (POST /loose-stock/open-bag) que acreditan el peso del producto al stock
 * suelto de su celda.
 */
export const LooseStockAdmin = () => {
  const { branches, loading: loadingBranches } = useBranches();
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [lines, setLines] = useState<LooseStockLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Diálogo "Abrir bolsa" (una bolsa a la vez, asignación EXPLÍCITA de la
  // celda de la planilla a la que se acreditan los kg).
  const [openBagDialogOpen, setOpenBagDialogOpen] = useState(false);
  const [selectedBagProduct, setSelectedBagProduct] = useState<ProductsProps | null>(null);
  const [selectedCellId, setSelectedCellId] = useState("");
  const [bagProducts, setBagProducts] = useState<ProductsProps[]>([]);
  const [loadingBagProducts, setLoadingBagProducts] = useState(false);
  const [openingBag, setOpeningBag] = useState(false);
  const [bagSearch, setBagSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cellQuery, setCellQuery] = useState("");
  const [cellOptions, setCellOptions] = useState<NativeSelectOption[]>([]);
  const [loadingCells, setLoadingCells] = useState(false);
  // Guard de búsquedas server-side: descarta respuestas que llegan desordenadas.
  const searchSeq = useRef(0);

  // Preselecciona la única sucursal cuando la org tiene exactamente una.
  useEffect(() => {
    if (!loadingBranches && branches.length === 1) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, loadingBranches]);

  const load = useCallback(async (branchId: string) => {
    setLoading(true);
    try {
      const data = await listLooseStocks(branchId || undefined);
      setLines(data.items);
      setEdits({});
    } catch (err: any) {
      toast.error(err?.message || "No se pudo listar el stock suelto");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(selectedBranchId);
  }, [selectedBranchId, load]);

  const handleSave = async (line: LooseStockLine) => {
    // La sucursal de la línea si no hay filtro; si hay filtro, la seleccionada.
    const branchId = selectedBranchId || line.branchId;
    if (!branchId) {
      toast.error("Seleccioná una sucursal para ajustar el stock");
      return;
    }
    const raw = (edits[line.priceKgPriceId] ?? "").trim();
    const qty = parseFloat(raw);
    if (raw === "" || Number.isNaN(qty) || qty < 0) {
      toast.error("Ingresá una cantidad válida en kg (0 o más)");
      return;
    }
    setSavingId(line.priceKgPriceId);
    try {
      await setLooseStock(line.priceKgPriceId, {
        branchId,
        quantity: qty,
      });
      toast.success(
        `Stock actualizado: ${line.lineName ?? "línea"} → ${formatKg(qty)} kg`,
      );
      await load(selectedBranchId);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo actualizar el stock suelto");
    } finally {
      setSavingId(null);
    }
  };

  // Carga en paralelo la planilla + tipos + marcas y arma las opciones de celda
  // destino ("MARCA · TIPO · Especie" + $/kg). Se corre al abrir el diálogo.
  const loadCellOptions = useCallback(async () => {
    setLoadingCells(true);
    try {
      const [plan, types, brands] = await Promise.all([
        getPriceKgPlan(),
        listPriceKgTypes(),
        listPriceKgBrands(),
      ]);
      const typeById = new Map(types.map((t) => [t.id, t]));
      const brandById = new Map(brands.map((b) => [b.id, b]));
      const options: NativeSelectOption[] = plan.map((cell) => {
        const brandName = brandById.get(cell.brandId)?.name ?? "";
        const typeName = typeById.get(cell.typeId)?.name ?? "";
        const speciesLabel = SPECIES_LABELS[cell.species] ?? cell.species;
        const label = `${brandName} · ${typeName} · ${speciesLabel}${
          cell.priceKg ? ` — $${cell.priceKg.toLocaleString("es-AR")}/kg` : ""
        }`;
        return { value: cell.id, label };
      });
      setCellOptions(options);
    } catch (_err) {
      toast.error("No se pudieron cargar las líneas de la planilla");
      setCellOptions([]);
    } finally {
      setLoadingCells(false);
    }
  }, []);

  // Búsqueda server-side de la BOLSA: consulta el catálogo COMPLETO (no solo la
  // primera página) por nombre, para que productos como "CAT CHOW" que quedan
  // más allá del pageSize inicial se puedan encontrar.
  const handleSearch = useCallback(async (term: string) => {
    const seq = ++searchSeq.current;
    setLoadingBagProducts(true);
    try {
      const data = await products(undefined, term, undefined, 1, 300);
      if (seq !== searchSeq.current) return; // respuesta vieja → descartar
      const items = Array.isArray(data) ? data : (data as any).items ?? [];
      setBagProducts(items);
    } catch (_err) {
      if (seq !== searchSeq.current) return;
      toast.error("No se pudieron cargar los productos para abrir la bolsa");
      setBagProducts([]);
    } finally {
      if (seq === searchSeq.current) setLoadingBagProducts(false);
    }
  }, []);

  // Debounce del término de búsqueda (300ms) para no disparar una request por
  // tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(bagSearch), 300);
    return () => clearTimeout(t);
  }, [bagSearch]);

  useEffect(() => {
    if (openBagDialogOpen) handleSearch(debouncedSearch);
  }, [debouncedSearch, openBagDialogOpen, handleSearch]);

  const handleOpenBagDialog = () => {
    setSelectedBagProduct(null);
    setSelectedCellId("");
    setBagSearch("");
    setDebouncedSearch("");
    setCellQuery("");
    setOpenBagDialogOpen(true);
    loadCellOptions();
  };

  const handleOpenChangeDialog = (open: boolean) => {
    setOpenBagDialogOpen(open);
    if (!open) {
      setSelectedBagProduct(null);
      setSelectedCellId("");
      setBagSearch("");
      setCellQuery("");
    }
  };

  const handleConfirmOpenBag = async () => {
    if (!selectedBranchId) {
      toast.error("Seleccioná una sucursal para abrir la bolsa");
      return;
    }
    if (!selectedBagProduct) {
      toast.error("Seleccioná una bolsa para abrir");
      return;
    }
    if (!selectedCellId) {
      toast.error("Seleccioná la línea suelta de destino");
      return;
    }
    const productId = selectedBagProduct._id ?? selectedBagProduct.id;
    if (!productId) return;
    const lineLabel =
      cellOptions.find((o) => o.value === selectedCellId)?.label ?? "";
    setOpeningBag(true);
    try {
      await openBag({
        productId,
        branchId: selectedBranchId,
        priceKgPriceId: selectedCellId,
      });
      toast.success(`Bolsa abierta de "${selectedBagProduct.name}" → ${lineLabel}`);
      setOpenBagDialogOpen(false);
      await load(selectedBranchId);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo abrir la bolsa");
    } finally {
      setOpeningBag(false);
    }
  };

  // Celdas filtradas client-side por el texto del input (case-insensitive).
  const filteredCellOptions = cellOptions.filter((o) =>
    o.label.toLowerCase().includes(cellQuery.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock suelto</h1>
        <p className="text-sm text-muted-foreground">
          Alimento vendido por kilo desde la planilla: ajustá los kg por línea y
          sucursal, o abrí bolsas para acreditar el peso suelto
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Líneas con stock suelto</CardTitle>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="loose-branch" className="text-xs">
                  Sucursal
                </Label>
                <NativeSelect
                  id="loose-branch"
                  ariaLabel="Sucursal"
                  value={selectedBranchId}
                  onValueChange={setSelectedBranchId}
                  options={[
                    { value: "", label: "Todas" },
                    ...branches.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                  className="w-44"
                />
              </div>
              <Button
                onClick={handleOpenBagDialog}
                title="−1 bolsa del producto, +peso en la celda de su planilla"
              >
                <PackageOpen className="h-4 w-4 mr-2" />
                Abrir bolsa
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader />
            </div>
          ) : lines.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 py-12 text-center">
              <Scale className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Sin stock suelto cargado
                {selectedBranchId ? " en esta sucursal" : ""}. Abrí una bolsa o
                cargá los kg directamente en una línea.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Línea</TableHead>
                    <TableHead>Especie</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead className="text-right">$/kg</TableHead>
                    <TableHead className="text-right">Stock suelto</TableHead>
                    <TableHead className="text-right">Ajustar kg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={`${line.priceKgPriceId}-${line.branchId}`}>
                      <TableCell className="font-medium">
                        {line.lineName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {SPECIES_LABELS[line.species ?? ""] ?? line.species ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {line.branchName ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.priceKg
                          ? `$${line.priceKg.toLocaleString("es-AR")}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatKg(line.quantity)} kg
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={`Ajustar kg de ${line.lineName ?? "la línea"}`}
                            className="h-8 w-24 px-2 text-right text-sm"
                            value={edits[line.priceKgPriceId] ?? String(line.quantity)}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [line.priceKgPriceId]: e.target.value,
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingId === line.priceKgPriceId}
                            onClick={() => handleSave(line)}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openBagDialogOpen} onOpenChange={handleOpenChangeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Abrir bolsa</DialogTitle>
            <DialogDescription>
              Elegí la bolsa (producto) y la línea suelta de destino a la que se
              acreditan sus kg.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="loose-branch-dialog" className="text-xs">
                Sucursal
              </Label>
              <NativeSelect
                id="loose-branch-dialog"
                ariaLabel="Sucursal"
                value={selectedBranchId}
                onValueChange={setSelectedBranchId}
                options={[
                  { value: "", label: "Todas" },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
                className="w-44"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="loose-bag-search" className="text-xs">
                Bolsa (producto)
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="loose-bag-search"
                  className="pl-9"
                  placeholder="Buscar producto..."
                  value={bagSearch}
                  onChange={(e) => setBagSearch(e.target.value)}
                />
              </div>
              <div className="max-h-52 overflow-y-auto rounded-md border">
                {loadingBagProducts ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    Buscando...
                  </p>
                ) : bagProducts.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    Sin resultado
                  </p>
                ) : (
                  bagProducts.map((product) => {
                    const id = product._id ?? product.id ?? "";
                    const isSel = selectedBagProduct
                      ? (selectedBagProduct._id ?? selectedBagProduct.id) === id
                      : false;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedBagProduct(product)}
                        className={
                          isSel
                            ? "block w-full bg-accent px-3 py-2 text-left text-sm"
                            : "block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        }
                      >
                        {product.name}
                      </button>
                    );
                  })
                )}
              </div>
              {selectedBagProduct && (
                <p className="text-xs text-muted-foreground">
                  Bolsa elegida: <span className="font-medium">{selectedBagProduct.name}</span>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Producto suelto destino</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Filtrar línea..."
                  value={cellQuery}
                  onChange={(e) => setCellQuery(e.target.value)}
                />
              </div>
              {loadingCells ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Cargando líneas...
                </p>
              ) : filteredCellOptions.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Sin resultado
                </p>
              ) : (
                <NativeSelect
                  id="loose-cell-dialog"
                  ariaLabel="Producto suelto destino"
                  value={selectedCellId}
                  onValueChange={setSelectedCellId}
                  options={filteredCellOptions}
                  placeholder="Seleccioná la línea"
                  className="w-full"
                />
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChangeDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmOpenBag}
              disabled={openingBag || loadingBagProducts || loadingCells}
            >
              <PackageOpen className="h-4 w-4 mr-2" />
              {openingBag ? "Abriendo..." : "Abrir bolsa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};