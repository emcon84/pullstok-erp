import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PackageOpen, Search } from "lucide-react";
import { toast } from "react-toastify";
import { useOpenBag } from "@/components/hooks/useOpenBag";
import { compactCellLabel, fullCellLabel, suggestLooseCells } from "@/lib/openBagCells";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OpenBagDialogProps {
  branchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Código a buscar automáticamente al abrir (p. ej. el recién escaneado). */
  initialBarcode?: string;
}

/** Max pills reachable with a single number key (1..9). */
const MAX_SHORTCUT_PILLS = 9;
/**
 * A deliberate key press fires only after this quiet window. A scanner burst
 * (or a multi-digit entry) sends further keydowns inside it and cancels the pick.
 */
const SHORTCUT_BURST_GUARD_MS = 120;

const isEditableTarget = (el: Element | null): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable === true
  );
};

interface ScannedProductDisplay {
  id: string;
  name: string;
  weightKg: number | null;
  price: number;
  code?: string | null;
  barcode?: string | null;
  category?: { name: string } | null;
}

export const OpenBagDialog = ({
  branchId,
  open,
  onOpenChange,
  onSuccess,
  initialBarcode,
}: OpenBagDialogProps) => {
  const {
    cellOptions,
    cells = [],
    loadingCells,
    searchProduct,
    openBag,
    error,
    loading,
    clearError,
  } = useOpenBag({ branchId });

  const [scannedProduct, setScannedProduct] = useState<ScannedProductDisplay | null>(null);
  const [selectedCellId, setSelectedCellId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const pillsGroupRef = useRef<HTMLDivElement>(null);

  // Focus barcode input when dialog opens
  useEffect(() => {
    if (open && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [open]);

  // Clear state when dialog closes
  useEffect(() => {
    if (!open) {
      setScannedProduct(null);
      setSelectedCellId("");
      setBarcode("");
      clearError();
    }
  }, [open, clearError]);

  const lookupBarcode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      clearError();
      try {
        const result = await searchProduct(code);
        setScannedProduct({
          id: result.product.id,
          name: result.product.name,
          weightKg: result.product.weightKg,
          price: result.product.price,
          code: result.product.code,
          barcode: result.product.barcode,
          category: result.product.category,
        });
        setSelectedCellId("");
      } catch (err: any) {
        // Error is already set by the hook, but ensure we have a user-friendly message
        if (err?.message && !error) {
          // The hook sets the error, but we can also show a generic message
        }
      }
    },
    [searchProduct, clearError, error],
  );

  const handleBarcodeSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await lookupBarcode(barcode);
    },
    [barcode, lookupBarcode],
  );

  // Código precargado (venimos del modal de escaneo): lo cargamos y buscamos
  // una sola vez por apertura, sin que el vendedor tenga que reescanear.
  const lookupRef = useRef(lookupBarcode);
  lookupRef.current = lookupBarcode;
  useEffect(() => {
    if (!open || !initialBarcode) return;
    setBarcode(initialBarcode);
    void lookupRef.current(initialBarcode);
  }, [open, initialBarcode]);

  // Loose cells that probably belong to the scanned product (brand from its name).
  const suggested = useMemo(
    () =>
      scannedProduct
        ? suggestLooseCells(scannedProduct.name, scannedProduct.category?.name, cells)
        : { cells: [], brandMatched: false },
    [scannedProduct, cells],
  );

  // `cellId` is passed by the one-click pills; the footer button uses the selected cell.
  const handleConfirm = useCallback(async (cellId?: string) => {
    const targetCellId = cellId ?? selectedCellId;
    if (!scannedProduct || !targetCellId || submitting) return;

    setSubmitting(true);
    try {
      const result = await openBag(scannedProduct.id, targetCellId);
      const weightKg = scannedProduct.weightKg ?? 0;
      toast.success(
        `Bolsa abierta: ${scannedProduct.name} → +${weightKg.toFixed(2)} kg en ${cellOptions.find((c) => c.value === targetCellId)?.label ?? result.priceKgPriceId}`,
      );
      onSuccess?.();
      onOpenChange(false);
    } catch {
      // Error is already set by the hook and shown via toast
    } finally {
      setSubmitting(false);
    }
  }, [scannedProduct, selectedCellId, submitting, openBag, cellOptions, onSuccess, onOpenChange]);

  const pills = useMemo(() => suggested.cells.slice(0, MAX_SHORTCUT_PILLS), [suggested.cells]);
  const shortcutsActive =
    open && !!scannedProduct && pills.length > 0 && !loading && !submitting && !loadingCells;

  // Hand focus to the pills once a product is found, so later digits are not
  // typed into the barcode input (and an editable field never swallows a pick).
  const hasPills = pills.length > 0;
  useEffect(() => {
    if (open && scannedProduct && hasPills) pillsGroupRef.current?.focus();
  }, [open, scannedProduct, hasPills]);

  const pickRef = useRef<(cellId: string) => void>(() => {});
  pickRef.current = (cellId: string) => {
    setSelectedCellId(cellId);
    void handleConfirm(cellId);
  };

  // 1..9 picks the matching pill, but only for a deliberate single press.
  useEffect(() => {
    if (!shortcutsActive) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Starts "just now": a digit right after the result renders is likely scanner tail.
    let lastKeyAt = Date.now();
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const quiet = now - lastKeyAt >= SHORTCUT_BURST_GUARD_MS;
      lastKeyAt = now;
      cancel();
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      if (!/^[1-9]$/.test(e.key) || !quiet) return;
      const pill = pills[Number(e.key) - 1];
      if (!pill) return;
      if (isEditableTarget(document.activeElement)) return;
      timer = setTimeout(() => {
        timer = null;
        pickRef.current(pill.id);
      }, SHORTCUT_BURST_GUARD_MS);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      cancel();
    };
  }, [shortcutsActive, pills]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleBarcodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBarcode(e.target.value);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir bolsa</DialogTitle>
          <DialogDescription>
            Escaneá el código de barras de la bolsa y seleccioná la celda destino
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: DialogContent es un grid; sin esto el form toma como ancho
            mínimo el de la etiqueta más larga de la celda (nowrap) y sus
            inputs se salen del modal. */}
        <form onSubmit={handleBarcodeSubmit} className="min-w-0 space-y-4">
          {/* Barcode input */}
          <div className="space-y-2">
            <Label htmlFor="barcode-input" className="text-sm font-medium">
              Código de barras
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={barcodeInputRef}
                id="barcode-input"
                type="text"
                placeholder="Escaneá o ingresá el código de barras"
                value={barcode}
                onChange={handleBarcodeChange}
                disabled={loading || submitting}
                className="pl-9"
                autoComplete="off"
                aria-label="Código de barras del producto"
              />
            </div>
            <Button
              type="submit"
              disabled={!barcode.trim() || loading || submitting}
              className="w-full"
            >
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </div>

          {/* Error display */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          {/* Scanned product display */}
          {scannedProduct && (
            <div className="space-y-2 rounded-lg bg-muted p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-lg">{scannedProduct.name}</h4>
                <span className="text-sm text-muted-foreground">
                  {scannedProduct.code || scannedProduct.barcode}
                </span>
              </div>
              {scannedProduct.category && (
                <p className="text-sm text-muted-foreground">{scannedProduct.category.name}</p>
              )}
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium">
                  {scannedProduct.weightKg != null ? scannedProduct.weightKg.toFixed(2) : "—"} kg
                </span>
                <span className="text-muted-foreground">
                  ${scannedProduct.price.toLocaleString("es-AR")}
                </span>
              </div>
            </div>
          )}

          {/* Cell selection */}
          <div className="space-y-2">
            <Label htmlFor="cell-select" className="text-sm font-medium">
              Celda destino
            </Label>
            {suggested.cells.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Sugeridas para{" "}
                  <span data-testid="suggested-brand" className="text-base font-semibold text-foreground">
                    {suggested.cells[0].brandName}
                  </span>
                </p>
                <div
                  ref={pillsGroupRef}
                  tabIndex={-1}
                  role="radiogroup"
                  aria-label="Celdas sugeridas"
                  className="flex flex-wrap gap-2 outline-none"
                >
                  {suggested.cells.map((c, index) => {
                    const checked = selectedCellId === c.id;
                    const prominent = suggested.cells.length === 1;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-keyshortcuts={index < MAX_SHORTCUT_PILLS ? String(index + 1) : undefined}
                        data-prominent={prominent ? "true" : undefined}
                        onClick={() => {
                          setSelectedCellId(c.id);
                          void handleConfirm(c.id);
                        }}
                        disabled={submitting || loading || loadingCells}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-base transition-colors",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : prominent
                              ? "border-primary text-primary ring-2 ring-primary/40 font-medium hover:bg-primary/10"
                              : "border-input hover:bg-accent",
                        )}
                      >
                        {index < MAX_SHORTCUT_PILLS && (
                          <kbd
                            aria-hidden="true"
                            className="rounded border border-current/30 px-1 text-[10px] font-mono leading-4 opacity-70"
                          >
                            {index + 1}
                          </kbd>
                        )}
                        {c.brandName !== suggested.genericBrandName ? fullCellLabel(c) : compactCellLabel(c)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Tocá o presioná el número</p>
              </div>
            )}
            <SearchableSelect
              id="cell-select"
              ariaLabel="Celda destino para abrir bolsa"
              value={selectedCellId}
              onValueChange={setSelectedCellId}
              options={cellOptions}
              placeholder={suggested.cells.length > 0 ? "Otra celda…" : "Seleccioná una celda"}
              searchPlaceholder="Buscar marca, tipo o especie…"
              emptyMessage="Sin celdas que coincidan"
              disabled={!scannedProduct || loadingCells}
            />
            {loadingCells && <p className="text-xs text-muted-foreground">Cargando celdas…</p>}
          </div>

          {/* Confirm footer */}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={!scannedProduct || !selectedCellId || submitting}>
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Abriendo…
                </>
              ) : (
                <>
                  <PackageOpen className="h-4 w-4 mr-2" />
                  Abrir bolsa
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};