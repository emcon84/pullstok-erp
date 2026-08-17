import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { PackageOpen, Save, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader } from "@/components/atoms/loader";
import { ProductSelector } from "@/components/molecules/ProductSelector";
import { useBranches } from "@/components/hooks/useBranches";
import {
  listLooseStocks,
  setLooseStock,
  openBag,
  type LooseStockLine,
} from "@/services/looseStock";
import { products } from "@/services/productService";
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

  // Picker "Abrir bolsa".
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerProducts, setPickerProducts] = useState<ProductsProps[]>([]);
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [openingBag, setOpeningBag] = useState(false);

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

  const handleOpenPicker = async () => {
    setPickerOpen(true);
    setLoadingPicker(true);
    try {
      // Productos con peso cargado para abrir bolsa. El picker busca por nombre
      // despues (client-side); abrir la bolsa descuenta 1 unidad y acredita el
      // weightKg del producto en la celda de la planilla.
      const data = await products(undefined, "", undefined, 1, 300);
      const items = Array.isArray(data) ? data : (data as any).items ?? [];
      setPickerProducts(items);
    } catch (_err) {
      toast.error("No se pudieron cargar los productos para abrir la bolsa");
      setPickerProducts([]);
    } finally {
      setLoadingPicker(false);
    }
  };

  const handleConfirmOpenBag = async (selected: { product: ProductsProps }[]) => {
    const branchId = selectedBranchId;
    if (!branchId) {
      toast.error("Seleccioná una sucursal para abrir la bolsa");
      return;
    }
    if (selected.length === 0) return;
    setOpeningBag(true);
    try {
      for (const { product } of selected) {
        const productId = product._id ?? product.id;
        if (!productId) continue;
        await openBag({ productId, branchId });
      }
      toast.success(
        selected.length === 1
          ? `Bolsa abierta de "${selected[0].product.name}"`
          : `${selected.length} bolsas abiertas`,
      );
      await load(selectedBranchId);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo abrir la bolsa");
    } finally {
      setOpeningBag(false);
    }
  };

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
                <select
                  id="loose-branch"
                  data-testid="loose-branch"
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="flex h-9 w-44 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Todas</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={handleOpenPicker}
                disabled={loadingPicker || openingBag}
                title="−1 bolsa del producto, +peso en la celda de su planilla"
              >
                <PackageOpen className="h-4 w-4 mr-2" />
                {openingBag ? "Abriendo..." : "Abrir bolsa"}
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

      <ProductSelector
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        products={pickerProducts}
        onConfirm={handleConfirmOpenBag}
      />
    </div>
  );
};